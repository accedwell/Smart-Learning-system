// Learner progress: lessons, the check-in quiz and the status shown on the teacher's class list.
const db = require('./db');
const { catalog } = require('./catalog');

// every learner gets a row per lesson; call after creating a learner or before reading their lessons
async function ensureLessons(learnerId, conn) {
  await db.query(
    'INSERT IGNORE INTO learner_lessons (learner_id, lesson_id) SELECT ?, id FROM lessons',
    [learnerId],
    conn,
  );
}

async function lessonsFor(learner) {
  await ensureLessons(learner.id);
  const rows = await db.query(
    `SELECT l.id, l.lesson_key, l.sort_order, ll.progress, ll.done, ll.assessment_viewed
       FROM learner_lessons ll JOIN lessons l ON l.id = ll.lesson_id
      WHERE ll.learner_id = ? ORDER BY l.sort_order`,
    [learner.id],
  );
  // lesson N is paired with the Nth assessment for the learner's grade, as on the dashboard
  const assessments = catalog.ASSESSMENTS_BANK[learner.grade] || [];
  return rows.map((r, i) => ({
    id: r.id,
    key: r.lesson_key,
    progress: r.progress,
    done: Boolean(r.done),
    assessmentViewed: Boolean(r.assessment_viewed),
    assessment: assessments[i] || null,
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

module.exports = { ensureLessons, lessonsFor, refreshProgress, statusFor, riskFrom, latestCheckin };
