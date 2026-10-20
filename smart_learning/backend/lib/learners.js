// Learner progress: lessons, the check-in quiz and the status shown on the teacher's class list.
const db = require('./db');
const { catalog, t } = require('./catalog');

// A learner has one lesson per subject they take (their 7 subjects). Learners from before
// subjects were chosen (none saved) keep the original three lessons. Call after creating a
// learner or changing their subjects, and before reading their lessons.
async function ensureLessons(learnerId, conn) {
  const subjects = await db.query('SELECT subject_key FROM learner_subjects WHERE learner_id = ?', [learnerId], conn);
  if (subjects.length === 0) {
    await db.query(
      "INSERT IGNORE INTO learner_lessons (learner_id, lesson_id) SELECT ?, id FROM lessons WHERE lesson_key IN ('lesson_1', 'lesson_2', 'lesson_3')",
      [learnerId], conn,
    );
    return;
  }
  await db.query(
    `DELETE ll FROM learner_lessons ll JOIN lessons l ON l.id = ll.lesson_id
      WHERE ll.learner_id = ? AND (l.subject_key IS NULL OR l.subject_key NOT IN (SELECT subject_key FROM learner_subjects WHERE learner_id = ?))`,
    [learnerId, learnerId], conn,
  );
  await db.query(
    `INSERT IGNORE INTO learner_lessons (learner_id, lesson_id)
     SELECT ?, l.id FROM lessons l JOIN learner_subjects ls ON ls.subject_key = l.subject_key AND ls.learner_id = ?`,
    [learnerId, learnerId], conn,
  );
}

// the assessment for a subject in a grade: the bank's own where there is one (Mathematics,
// English, Life Sciences), otherwise the subject's term assessment
const TERM_ASSESSMENT_DUE = { 10: '30 Oct', 11: '31 Oct', 12: '3 Nov' };
function assessmentFor(grade, subjectKey) {
  const own = (catalog.ASSESSMENTS_BANK[grade] || []).find((a) => a.subjectKey === subjectKey);
  if (own) return own;
  return subjectKey
    ? { subjectKey, titleKey: 'assess_generic_title', descKey: 'assess_generic_desc', due: TERM_ASSESSMENT_DUE[grade] || '30 Oct' }
    : null;
}

// a lesson's title in English, e.g. for notifications: "Algebraic Functions & Graphs", or
// "This term's Geography work"
function lessonTitle(lessonRow) {
  return lessonRow.lesson_key.startsWith('lesson_term_work:')
    ? t('lesson_term_work', { subject: t(lessonRow.subject_key) })
    : t(lessonRow.lesson_key);
}

async function lessonsFor(learner) {
  await ensureLessons(learner.id);
  const rows = await db.query(
    `SELECT l.id, l.lesson_key, l.sort_order, l.subject_key, ll.progress, ll.done, ll.assessment_viewed
       FROM learner_lessons ll JOIN lessons l ON l.id = ll.lesson_id
      WHERE ll.learner_id = ? ORDER BY l.sort_order`,
    [learner.id],
  );
  return rows.map((r) => ({
    id: r.id,
    // the lesson title's i18n key; "This term's {subject} work" for subjects without their own topic
    key: r.lesson_key.startsWith('lesson_term_work:') ? 'lesson_term_work' : r.lesson_key,
    subjectKey: r.subject_key,
    progress: r.progress,
    done: Boolean(r.done),
    assessmentViewed: Boolean(r.assessment_viewed),
    assessment: assessmentFor(learner.grade, r.subject_key),
  }));
}

// overall progress = average progress across the learner's lessons
async function refreshProgress(learnerId, conn) {
  await db.query(
    `UPDATE users SET progress = (SELECT COALESCE(ROUND(AVG(progress)), 0) FROM learner_lessons WHERE learner_id = ?)
      WHERE id = ?`,
    [learnerId, learnerId],
    conn,
  );
}

// a score (0 to 1) as a status: 80% and up on track, 50% and up watch, below that at risk
function statusFor(pct) {
  if (pct == null) return null;
  return pct >= 0.8 ? 'on_track' : pct >= 0.5 ? 'watch' : 'at_risk';
}

// Whether a learner is at risk, and what that rests on. The teacher's tests decide (the
// average of the learner's FIRST try at each: later tries are practice, after the answers
// were shown); with no test taken yet, the latest check-in quiz does.
function riskFrom({ testAverage, checkinPct }) {
  if (testAverage != null) return { status: statusFor(testAverage), basis: 'tests' };
  if (checkinPct != null) return { status: statusFor(checkinPct), basis: 'checkin' };
  return { status: null, basis: null };
}

async function latestCheckin(learnerId) {
  const row = await db.one(
    'SELECT score, total, feedback, created_at FROM checkin_attempts WHERE learner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    [learnerId],
  );
  return row && { score: row.score, total: row.total, feedback: row.feedback, takenAt: row.created_at };
}

module.exports = { ensureLessons, lessonsFor, lessonTitle, refreshProgress, statusFor, riskFrom, latestCheckin };
