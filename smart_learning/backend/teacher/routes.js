// /api/teacher: the teacher's own classes with each learner's status, quizzes and their
// results, question papers (with AI quiz drafting) and feedback from the principal. A teacher
// only ever sees their own classes, the learners in them, and their own quizzes and papers.
const fs = require('node:fs/promises');
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const ai = require('../lib/ai');
const { aiLimiter } = require('../lib/rateLimit');
const { catalog, t, langNote } = require('../lib/catalog');
const { statusFor } = require('../lib/learners');
const { shortName } = require('../lib/users');
const { parseQuiz, teacherView } = require('../lib/quizzes');
const { paperUpload, checkFileType, filePath, removeFile } = require('../lib/uploads');
const { classView, teacherClassesFor, sendToClasses, classIdsOf, teachesLearner } = require('../lib/classes');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('teacher'));

// The teacher's classes, and the learners in them (or in one class, ?classId=, or one
// grade, ?grade=10) with their latest check-in quiz and their average on this teacher's
// quizzes, from each quiz's first attempt so retakes don't inflate it. Status follows the
// check-in, as on the dashboard.
router.get('/class', async (req, res) => {
  const grade = req.query.grade ? http.oneOf(String(req.query.grade), catalog.GRADES, 'grade') : null;
  const classId = req.query.classId ? http.id(req.query.classId, 'classId') : null;
  const classes = await db.query('SELECT * FROM classes WHERE teacher_id = ? ORDER BY grade, name, subject_key', [req.user.id]);
  if (classId && !classes.some((c) => c.id === classId)) throw http.notFound('class_not_found', 'No such class among yours');
  const members = classes.length
    ? await db.query('SELECT class_id, learner_id FROM class_learners WHERE class_id IN (?)', [classes.map((c) => c.id)])
    : [];
  const shown = members.filter((m) => !classId || m.class_id === classId);
  const learnerIds = [...new Set(shown.map((m) => m.learner_id))];
  const learners = learnerIds.length === 0 ? [] : await db.query(
    `SELECT u.id, u.name, u.grade, u.progress,
            c.score AS checkin_score, c.total AS checkin_total, c.created_at AS checkin_at,
            q.avg_pct, COALESCE(q.attempts, 0) AS attempts
       FROM users u
       LEFT JOIN checkin_attempts c ON c.id = (
         SELECT id FROM checkin_attempts WHERE learner_id = u.id ORDER BY created_at DESC, id DESC LIMIT 1)
       LEFT JOIN (
         SELECT s.learner_id, AVG(s.score / s.total) AS avg_pct, COUNT(*) AS attempts
           FROM quiz_submissions s JOIN quizzes z ON z.id = s.quiz_id
          WHERE z.teacher_id = ? AND NOT EXISTS (
            SELECT 1 FROM quiz_submissions e WHERE e.quiz_id = s.quiz_id AND e.learner_id = s.learner_id AND e.id < s.id)
          GROUP BY s.learner_id) q ON q.learner_id = u.id
      WHERE u.role = 'learner' AND u.id IN (?) ${grade ? 'AND u.grade = ?' : ''}
      ORDER BY u.grade, u.name`,
    grade ? [req.user.id, learnerIds, grade] : [req.user.id, learnerIds],
  );
  res.json({
    classes: classes.map((c) => ({
      ...classView(c), learnerIds: members.filter((m) => m.class_id === c.id).map((m) => m.learner_id),
    })),
    learners: learners.map((l) => {
      const checkinPct = l.checkin_total ? l.checkin_score / l.checkin_total : null;
      const quizAverage = l.avg_pct == null ? null : Number(l.avg_pct);
      return {
        id: l.id, name: l.name, shortName: shortName(l.name), grade: l.grade, progress: l.progress,
        classIds: shown.filter((m) => m.learner_id === l.id).map((m) => m.class_id),
        status: statusFor(checkinPct ?? quizAverage),
        checkin: l.checkin_total ? { score: l.checkin_score, total: l.checkin_total, takenAt: l.checkin_at } : null,
        quizAverage: quizAverage == null ? null : Math.round(quizAverage * 100),
        quizAttempts: l.attempts,
      };
    }),
  });
});

// only for a learner in one of this teacher's classes
router.post('/class/:learnerId/suggestion', aiLimiter, async (req, res) => {
  const learner = await db.one("SELECT * FROM users WHERE id = ? AND role = 'learner'", [http.id(req.params.learnerId, 'learnerId')]);
  if (!learner || !(await teachesLearner(req.user.id, learner.id))) throw http.notFound('learner_not_found', 'No such learner in your classes');
  const checkin = await db.one('SELECT score, total FROM checkin_attempts WHERE learner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [learner.id]);
  const status = checkin ? statusFor(checkin.score / checkin.total) : null;
  const context = [
    `${t('grade_' + learner.grade)} learner, overall progress ${learner.progress}%`,
    checkin ? `scored ${checkin.score}/${checkin.total} on the latest check-in quiz` : 'has not taken the check-in quiz yet',
  ].join('; ');
  const suggestion = await ai.askOneLiner(
    `Learner ${shortName(learner.name)} is flagged "${status ? t('status_' + status) : 'no data yet'}" on a school platform. ` +
    `Context: ${context}. In ONE short, practical sentence (max 25 words), suggest a concrete classroom intervention ` +
    `a teacher could assign today.${langNote(http.body(req).lang)}`,
  );
  res.json({ suggestion });
});

// ---- quizzes ----

async function ownQuiz(req) {
  const quiz = await db.one('SELECT * FROM quizzes WHERE id = ? AND teacher_id = ?', [http.id(req.params.id), req.user.id]);
  if (!quiz) throw http.notFound('quiz_not_found', 'No such quiz');
  return quiz;
}

// quizzes as the teacher sees them, each with the classes it was sent to
async function quizViews(rows) {
  const classIds = await classIdsOf('quiz', rows.map((q) => q.id));
  return rows.map((q) => ({ ...teacherView(q), classIds: classIds.get(q.id) }));
}
const quizView = async (row) => (await quizViews([row]))[0];

// The quiz from the body, sent to `classIds`: one or more of this teacher's classes, of one
// grade and subject, which the quiz takes.
async function quizFromBody(req) {
  const b = http.body(req);
  const classes = await teacherClassesFor(req.user.id, b.classIds);
  return { classes, quiz: parseQuiz({ ...b, grade: classes[0].grade, subjectKey: classes[0].subject_key }) };
}

router.get('/quizzes', async (req, res) => {
  const rows = await db.query(
    `SELECT z.*, (SELECT COUNT(DISTINCT s.learner_id) FROM quiz_submissions s WHERE s.quiz_id = z.id) AS result_count
       FROM quizzes z WHERE z.teacher_id = ? ORDER BY z.grade, z.created_at`,
    [req.user.id],
  );
  const views = await quizViews(rows);
  res.json({ quizzes: views.map((q, i) => ({ ...q, resultCount: rows[i].result_count })) });
});

router.post('/quizzes', async (req, res) => {
  const { classes, quiz } = await quizFromBody(req);
  const id = await db.tx(async (conn) => {
    const result = await db.query(
      'INSERT INTO quizzes (teacher_id, title, grade, subject_key, time_limit_min, questions) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, quiz.title, quiz.grade, quiz.subject_key, quiz.time_limit_min, JSON.stringify(quiz.questions)], conn,
    );
    await sendToClasses('quiz', result.insertId, classes, conn);
    return result.insertId;
  });
  res.status(201).json({ quiz: await quizView(await db.one('SELECT * FROM quizzes WHERE id = ?', [id])) });
});

router.get('/quizzes/:id', async (req, res) => {
  res.json({ quiz: await quizView(await ownQuiz(req)) });
});

// replacing the questions clears earlier results, which were marked against the old ones
router.put('/quizzes/:id', async (req, res) => {
  const existing = await ownQuiz(req);
  const { classes, quiz } = await quizFromBody(req);
  const questionsChanged = JSON.stringify(quiz.questions) !== JSON.stringify(existing.questions);
  await db.tx(async (conn) => {
    await db.query(
      'UPDATE quizzes SET title = ?, grade = ?, subject_key = ?, time_limit_min = ?, questions = ? WHERE id = ?',
      [quiz.title, quiz.grade, quiz.subject_key, quiz.time_limit_min, JSON.stringify(quiz.questions), existing.id], conn,
    );
    await sendToClasses('quiz', existing.id, classes, conn);
    if (questionsChanged) {
      await db.query('DELETE FROM quiz_attempts WHERE quiz_id = ?', [existing.id], conn);
      await db.query('DELETE FROM quiz_submissions WHERE quiz_id = ?', [existing.id], conn);
    }
  });
  res.json({ quiz: await quizView(await db.one('SELECT * FROM quizzes WHERE id = ?', [existing.id])), resultsCleared: questionsChanged });
});

router.delete('/quizzes/:id', async (req, res) => {
  const quiz = await ownQuiz(req);
  await db.query('DELETE FROM quizzes WHERE id = ?', [quiz.id]);
  res.status(204).end();
});

// one row per learner: the latest attempt (score, total, ...), the first one and how many there were
router.get('/quizzes/:id/results', async (req, res) => {
  const quiz = await ownQuiz(req);
  const rows = await db.query(
    `SELECT s.learner_id, u.name, s.score, s.total, s.timed_out, s.submitted_at
       FROM quiz_submissions s JOIN users u ON u.id = s.learner_id
      WHERE s.quiz_id = ? ORDER BY u.name, s.learner_id, s.id`,
    [quiz.id],
  );
  const mark = (r) => ({ score: r.score, total: r.total, timedOut: Boolean(r.timed_out), submittedAt: r.submitted_at });
  const results = [];
  for (const r of rows) {
    const last = results[results.length - 1];
    if (last && last.learnerId === r.learner_id) {
      Object.assign(last, mark(r));
      last.attempts++;
    } else {
      results.push({ learnerId: r.learner_id, learner: r.name, ...mark(r), attempts: 1, first: mark(r) });
    }
  }
  res.json({ quizId: quiz.id, results });
});

// ---- question papers ----

// papers as the teacher sees them, each with the classes it was sent to
async function paperViews(rows) {
  const classIds = await classIdsOf('paper', rows.map((p) => p.id));
  return rows.map((p) => ({
    id: p.id, title: p.title, grade: p.grade, subjectKey: p.subject_key, classIds: classIds.get(p.id), fileName: p.file_name,
    mimeType: p.mime_type, sizeBytes: p.size_bytes, fileUrl: `/api/papers/${p.id}/file`, createdAt: p.created_at,
  }));
}

async function ownPaper(req) {
  const paper = await db.one('SELECT * FROM papers WHERE id = ? AND teacher_id = ?', [http.id(req.params.id), req.user.id]);
  if (!paper) throw http.notFound('paper_not_found', 'No such question paper');
  return paper;
}

router.get('/papers', async (req, res) => {
  const rows = await db.query('SELECT * FROM papers WHERE teacher_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ papers: await paperViews(rows) });
});

// multipart/form-data: title, classIds ("3,4" or the field repeated: the teacher's classes of
// one grade and subject, which the paper takes), file
router.post('/papers', paperUpload, async (req, res) => {
  if (!req.file) throw http.badRequest('paper_no_file', 'Attach the question paper file');
  try {
    await checkFileType(req.file);
    const b = http.body(req);
    const classes = await teacherClassesFor(req.user.id, b.classIds);
    const fields = {
      teacher_id: req.user.id,
      title: http.text(b.title, 'title', { max: 150 }),
      grade: classes[0].grade,
      subject_key: classes[0].subject_key,
      file_name: (req.file.originalname || 'paper').slice(0, 255),
      stored_name: req.file.filename,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
    };
    const id = await db.tx(async (conn) => {
      const result = await db.query('INSERT INTO papers SET ?', [fields], conn);
      await sendToClasses('paper', result.insertId, classes, conn);
      return result.insertId;
    });
    res.status(201).json({ paper: (await paperViews([await db.one('SELECT * FROM papers WHERE id = ?', [id])]))[0] });
  } catch (err) {
    removeFile(req.file.filename);
    throw err;
  }
});

router.delete('/papers/:id', async (req, res) => {
  const paper = await ownPaper(req);
  await db.query('DELETE FROM papers WHERE id = ?', [paper.id]);
  removeFile(paper.stored_name);
  res.status(204).end();
});

// AI reads the paper and returns a quiz draft for the teacher to review and publish (not saved yet)
router.post('/papers/:id/generate-quiz', aiLimiter, async (req, res) => {
  const paper = await ownPaper(req);
  const kind = paper.mime_type === 'application/pdf' ? 'PDF' : 'image';
  const questions = await ai.quizFromPaper({
    fileBase64: (await fs.readFile(filePath(paper.stored_name))).toString('base64'),
    mimeType: paper.mime_type,
    prompt: `This ${kind} is a photo or scan of a ${t('grade_' + paper.grade)} ${t(paper.subject_key)} question paper titled ` +
      `"${paper.title}". Read the questions in it and write up to 6 short-answer quiz questions based on its content, ` +
      'each with a concise correct answer a learner would type themselves.',
  });
  if (questions.length === 0) throw new http.HttpError(422, 'invalid_json', 'No quiz questions could be read from this paper');
  const classIds = (await classIdsOf('paper', [paper.id])).get(paper.id);
  res.json({
    draft: { title: 'AI Quiz — ' + paper.title, classIds, grade: paper.grade, subjectKey: paper.subject_key, timeLimitMin: 0, questions },
  });
});

// ---- feedback from the principal ----

router.get('/feedback', async (req, res) => {
  const rows = await db.query(
    `SELECT f.id, f.message, f.created_at, u.name AS from_name
       FROM teacher_feedback f LEFT JOIN users u ON u.id = f.from_user_id
      WHERE f.teacher_id = ? ORDER BY f.created_at DESC`,
    [req.user.id],
  );
  res.json({ feedback: rows.map((r) => ({ id: r.id, message: r.message, from: r.from_name, sentAt: r.created_at })) });
});

module.exports = router;
