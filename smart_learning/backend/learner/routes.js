   // /api/learner: lessons, the check-in quiz, the quizzes and question papers sent to the
// learner's classes, and rating the teachers of those classes.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const ai = require('../lib/ai');
const { aiLimiter } = require('../lib/rateLimit');
const { catalog, t, langNote } = require('../lib/catalog');
const { lessonsFor, refreshProgress, statusFor, latestCheckin } = require('../lib/learners');
const { parentIdsOf, notify } = require('../lib/users');
const { learnerView, mark } = require('../lib/quizzes');
const { sentToLearners, teachesLearner } = require('../lib/classes');
const onlineClasses = require('../lib/onlineClasses');
const sms = require('../lib/sms');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('learner'));

// answers sent this long after a timed quiz's deadline are not accepted
const DEADLINE_GRACE_MS = 30 * 1000;

// An SMS to the learner's linked parents (those with a phone number on file). Sent after the
// change is saved and never waited for, so a slow or failed SMS can't hold up the learner.
function textParents(learner, message) {
  parentIdsOf(learner.id).then(sms.phonesOf).then((phones) => sms.sendQuietly(phones, 'Smart Learning: ' + message))
    .catch((err) => console.error('[sms] parent alert:', err.message));
}

// AI extras are best-effort: the main action still succeeds when AI is unavailable or the
// learner has used up their AI budget for the minute
async function optionalAi(req, fn) {
  if (!aiLimiter.allows(req)) return null;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof http.HttpError) return null;
    throw err;
  }
}

// ---- lessons ----

router.get('/lessons', async (req, res) => {
  res.json({ grade: req.user.grade, lessons: await lessonsFor(req.user) });
});

// marks the lesson done and asks AI for the next best activity (`recommendation` is null without AI)
router.post('/lessons/:id/complete', async (req, res) => {
  const lessonId = http.id(req.params.id);
  const lesson = await db.one('SELECT * FROM lessons WHERE id = ?', [lessonId]);
  if (!lesson) throw http.notFound('lesson_not_found', 'No such lesson');
  await lessonsFor(req.user); // makes sure the learner has their lesson rows
  await db.tx(async (conn) => {
    await db.query('UPDATE learner_lessons SET progress = 100, done = 1 WHERE learner_id = ? AND lesson_id = ?', [req.user.id, lessonId], conn);
    await refreshProgress(req.user.id, conn);
    await notify(await parentIdsOf(req.user.id, conn), { message: `${req.user.name} completed the lesson "${t(lesson.lesson_key)}".` }, conn);
  });
  textParents(req.user, `${req.user.name} completed the lesson "${t(lesson.lesson_key)}".`);
  const recommendation = await optionalAi(req, () => ai.askOneLiner(
    `A learner just completed the lesson "${t(lesson.lesson_key)}" on an education platform called Smart Learning. ` +
    'In ONE short sentence (max 25 words), recommend the next best personalised learning activity for them, warmly and ' +
    `specifically.${langNote(http.body(req).lang)}`,
  ));
  res.json({ lessons: await lessonsFor(req.user), recommendation });
});

router.post('/lessons/:id/assessment-viewed', async (req, res) => {
  await lessonsFor(req.user);
  await db.query('UPDATE learner_lessons SET assessment_viewed = 1 WHERE learner_id = ? AND lesson_id = ?', [req.user.id, http.id(req.params.id)]);
  res.json({ lessons: await lessonsFor(req.user) });
});

// ---- check-in quiz (the built-in multiple-choice quiz from the catalog) ----

router.get('/checkin', async (req, res) => {
  res.json({ latest: await latestCheckin(req.user.id) });
});

// answers: the chosen option index for each question, in order
router.post('/checkin', async (req, res) => {
  const b = http.body(req);
  const bank = catalog.QUIZ_BANK;
  if (!Array.isArray(b.answers) || b.answers.length !== bank.length) {
    throw http.badRequest('invalid_field', `answers must list one choice for each of the ${bank.length} questions`, { field: 'answers' });
  }
  const answers = b.answers.map((a) => (Number.isInteger(a) ? a : null));
  const missed = bank.filter((item, i) => answers[i] !== item.correct);
  const score = bank.length - missed.length;
  const feedback = missed.length === 0 ? null : await optionalAi(req, () => ai.askOneLiner(
    `A ${t('grade_' + req.user.grade)} learner just took a short check-in quiz on a platform called Smart Learning and got ` +
    `${score} out of ${bank.length} correct. They struggled with questions about: ${missed.map((m) => t(m.qKey)).join('; ')}. ` +
    `In ONE short, encouraging sentence (max 25 words), tell them what to focus on next.${langNote(b.lang)}`,
  ));
  await db.query('INSERT INTO checkin_attempts (learner_id, answers, score, total, feedback) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, JSON.stringify(answers), score, bank.length, feedback ? feedback.slice(0, 500) : null]);
  res.status(201).json({
    score, total: bank.length, status: statusFor(score / bank.length),
    missed: missed.map((m) => ({ qKey: m.qKey, correctKey: m.optKeys[m.correct] })),
    feedback,
  });
});

// ---- teachers' quizzes ----

function attemptView(a) {
  if (!a) return null;
  return {
    startedAt: a.started_at, deadline: a.deadline, submitted: a.submitted_at != null, submittedAt: a.submitted_at,
    score: a.score, total: a.total, timedOut: Boolean(a.timed_out),
  };
}

async function quizForLearner(req) {
  const quiz = await db.one(
    `SELECT z.*, u.name AS teacher_name FROM quizzes z LEFT JOIN users u ON u.id = z.teacher_id
      WHERE z.id = ? AND ${sentToLearners('quiz', 'z')}`,
    [http.id(req.params.id), req.user.id],
  );
  if (!quiz) throw http.notFound('quiz_not_found', 'No such quiz for your classes');
  return quiz;
}

// quizzes sent to the learner's classes (?subjectKey= narrows to one subject), each with their attempt,
// and `subjects`: the subjects of the classes the learner is in (in catalog order), so the
// subject filter shows what the learner takes, with or without a quiz yet
router.get('/quizzes', async (req, res) => {
  const params = [req.user.id, req.user.id, req.user.id];
  let filter = '';
  if (req.query.subjectKey && req.query.subjectKey !== 'all') {
    filter = 'AND z.subject_key = ?';
    params.push(http.oneOf(req.query.subjectKey, catalog.SUBJECT_OPTIONS, 'subjectKey'));
  }
  const rows = await db.query(
    `SELECT z.*, u.name AS teacher_name, a.started_at, a.deadline, a.submitted_at, a.score, a.total, a.timed_out,
            a.id AS attempt_id, f.score AS first_score, f.total AS first_total,
            (SELECT COUNT(*) FROM quiz_submissions c WHERE c.quiz_id = z.id AND c.learner_id = a.learner_id) AS tries
       FROM quizzes z
       LEFT JOIN users u ON u.id = z.teacher_id
       LEFT JOIN quiz_attempts a ON a.quiz_id = z.id AND a.learner_id = ?
       LEFT JOIN quiz_submissions f ON f.id = (
         SELECT MIN(id) FROM quiz_submissions WHERE quiz_id = z.id AND learner_id = ?)
      WHERE ${sentToLearners('quiz', 'z')} ${filter}
      ORDER BY z.subject_key, z.created_at`,
    params,
  );
  const mine = await db.query(
    'SELECT DISTINCT k.subject_key FROM class_learners cl JOIN classes k ON k.id = cl.class_id WHERE cl.learner_id = ?',
    [req.user.id],
  );
  const taken = new Set(mine.map((r) => r.subject_key));
  res.json({
    subjects: catalog.SUBJECT_OPTIONS.filter((k) => taken.has(k)),
    quizzes: rows.map((q) => ({
      ...learnerView(q),
      attempt: q.attempt_id ? attemptView(q) : null,
      // the try that counts towards the learner's status; the rest are practice
      firstTry: q.first_total ? { score: q.first_score, total: q.first_total } : null,
      tries: Number(q.tries || 0),
    })),
  });
});

// starts the quiz (or resumes the attempt in progress); { retake: true } starts over after a submission
router.post('/quizzes/:id/start', async (req, res) => {
  const quiz = await quizForLearner(req);
  const existing = await db.one('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND learner_id = ?', [quiz.id, req.user.id]);
  const retake = http.body(req).retake === true;
  if (existing && !(existing.submitted_at && retake)) {
    return res.json({ quiz: learnerView(quiz), attempt: attemptView(existing) });
  }
  const now = new Date();
  const deadline = quiz.time_limit_min ? new Date(now.getTime() + quiz.time_limit_min * 60000) : null;
  await db.query(
    `INSERT INTO quiz_attempts (quiz_id, learner_id, total, started_at, deadline) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE answers = NULL, score = NULL, timed_out = 0, total = VALUES(total),
       started_at = VALUES(started_at), deadline = VALUES(deadline), submitted_at = NULL`,
    [quiz.id, req.user.id, quiz.questions.length, now, deadline],
  );
  const attempt = await db.one('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND learner_id = ?', [quiz.id, req.user.id]);
  res.status(201).json({ quiz: learnerView(quiz), attempt: attemptView(attempt) });
});

// answers: the typed answer for each question, in order
router.post('/quizzes/:id/submit', async (req, res) => {
  const quiz = await quizForLearner(req);
  const attempt = await db.one('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND learner_id = ?', [quiz.id, req.user.id]);
  if (!attempt) throw http.conflict('quiz_not_started', 'Start the quiz before submitting it');
  if (attempt.submitted_at) throw http.conflict('quiz_already_submitted', 'This quiz has already been submitted; start a retake first');

  const b = http.body(req);
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, quiz.questions.length)
    .map((a) => (typeof a === 'string' ? a.slice(0, 200) : ''));
  const now = Date.now();
  const deadline = attempt.deadline ? new Date(attempt.deadline).getTime() : null;
  const timedOut = deadline != null && now >= deadline;
  // answers that arrive well after the deadline are discarded (the UI submits at the deadline itself)
  const late = deadline != null && now > deadline + DEADLINE_GRACE_MS;
  const score = late ? 0 : mark(quiz, answers);

  let firstTry = false;
  await db.tx(async (conn) => {
    firstTry = !(await db.one('SELECT 1 FROM quiz_submissions WHERE quiz_id = ? AND learner_id = ? LIMIT 1', [quiz.id, req.user.id], conn));
    const answersJson = JSON.stringify(late ? [] : answers);
    const { affectedRows } = await db.query(
      'UPDATE quiz_attempts SET answers = ?, score = ?, total = ?, timed_out = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL',
      [answersJson, score, quiz.questions.length, timedOut, new Date(now), attempt.id], conn,
    );
    if (!affectedRows) throw http.conflict('quiz_already_submitted', 'This quiz has already been submitted; start a retake first');
    // kept for the teacher even after a retake replaces the attempt above
    await db.query(
      `INSERT INTO quiz_submissions (quiz_id, learner_id, answers, score, total, timed_out, started_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [quiz.id, req.user.id, answersJson, score, quiz.questions.length, timedOut, attempt.started_at, new Date(now)], conn,
    );
    // only the learner's linked parents hear about the mark
    await notify(await parentIdsOf(req.user.id, conn), {
      message: `${req.user.name} scored ${score}/${quiz.questions.length} on "${quiz.title}" (${t(quiz.subject_key)}).`,
    }, conn);
    // the first try is the one that counts towards being at risk: the teacher hears at once
    if (firstTry && quiz.teacher_id && statusFor(score / quiz.questions.length) === 'at_risk') {
      await notify([quiz.teacher_id], {
        message: `${req.user.name} scored ${score}/${quiz.questions.length} on "${quiz.title}" and may be at risk.`,
      }, conn);
    }
  });
  // parents get a text for the first try only (the mark the teacher sees), not for practice
  if (firstTry) {
    const atRisk = statusFor(score / quiz.questions.length) === 'at_risk';
    textParents(req.user, `${req.user.name} scored ${score}/${quiz.questions.length} on "${quiz.title}" (${t(quiz.subject_key)}).` +
      (atRisk ? ' This mark puts them at risk: their teacher will follow up.' : ''));
  }
  const saved = await db.one('SELECT * FROM quiz_attempts WHERE id = ?', [attempt.id]);
  res.json({
    attempt: attemptView(saved),
    // only the first try counts towards the learner's status; later ones are practice
    firstTry,
    // the marked questions, now that the attempt is over
    review: quiz.questions.map((q, i) => ({
      text: q.text, answer: q.answer, given: answers[i] || '',
      correct: !late && Boolean(answers[i]) && answers[i].trim().toLowerCase() === q.answer.trim().toLowerCase(),
    })),
  });
});

// ---- question papers ----

router.get('/papers', async (req, res) => {
  const rows = await db.query(
    `SELECT p.*, u.name AS teacher_name FROM papers p LEFT JOIN users u ON u.id = p.teacher_id
      WHERE ${sentToLearners('paper', 'p')} ORDER BY p.created_at DESC`,
    [req.user.id],
  );
  res.json({
    papers: rows.map((p) => ({
      id: p.id, title: p.title, grade: p.grade, subjectKey: p.subject_key, fileName: p.file_name, mimeType: p.mime_type,
      teacherName: p.teacher_name, fileUrl: `/api/papers/${p.id}/file`, createdAt: p.created_at,
    })),
  });
});

// ---- rating teachers (only the teachers of the learner's own classes) ----

router.get('/teachers', async (req, res) => {
  const rows = await db.query(
    `SELECT u.id, u.name, u.subject_key, u.teach_grade, r.rating AS my_rating
       FROM users u LEFT JOIN teacher_ratings r ON r.teacher_id = u.id AND r.learner_id = ?
      WHERE u.role = 'teacher' AND EXISTS (
        SELECT 1 FROM classes k JOIN class_learners cl ON cl.class_id = k.id WHERE k.teacher_id = u.id AND cl.learner_id = ?)
      ORDER BY u.name`,
    [req.user.id, req.user.id],
  );
  res.json({
    teachers: rows.map((r) => ({
      id: r.id, name: r.name, subjectKey: r.subject_key, gradeKey: r.teach_grade ? 'grade_' + r.teach_grade : null, myRating: r.my_rating,
    })),
  });
});

// one rating per learner per teacher; rating again replaces it
router.put('/teachers/:id/rating', async (req, res) => {
  const teacher = await db.one("SELECT id FROM users WHERE id = ? AND role = 'teacher'", [http.id(req.params.id)]);
  if (!teacher || !(await teachesLearner(teacher.id, req.user.id))) throw http.notFound('teacher_not_found', 'No such teacher of your classes');
  const rating = http.int(http.body(req).rating, 'rating', { min: 1, max: 5 });
  await db.query(
    'INSERT INTO teacher_ratings (teacher_id, learner_id, rating) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating)',
    [teacher.id, req.user.id, rating],
  );
  res.json({ teacherId: teacher.id, rating });
});

// ---- online classes ----

// The online classes of the learner's classes from the last week on, with the learner's own
// register entry. The class itself happens in the live classroom (/api/live), and entering it
// is what marks the learner in the register.
router.get('/online-classes', async (req, res) => {
  const rows = await db.query(
    `SELECT oc.*, k.name AS class_name, k.grade, k.subject_key, u.name AS teacher_name,
            a.status AS my_status, a.joined_at, a.last_joined_at, a.seconds_attended
       FROM online_classes oc
       JOIN classes k ON k.id = oc.class_id
       JOIN class_learners cl ON cl.class_id = oc.class_id AND cl.learner_id = ?
       LEFT JOIN users u ON u.id = oc.teacher_id
       LEFT JOIN online_attendance a ON a.online_class_id = oc.id AND a.learner_id = ?
      WHERE oc.starts_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
      ORDER BY oc.starts_at, oc.id`,
    [req.user.id, req.user.id],
  );
  res.json({
    onlineClasses: rows.map((oc) => ({
      ...onlineClasses.view(oc), teacherName: oc.teacher_name, myStatus: oc.my_status,
      myMinutes: oc.joined_at ? onlineClasses.minutesAttended(oc) : null,
    })),
  });
});

module.exports = router;
