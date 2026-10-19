// /api/teacher: the teacher's own classes with each learner's status, quizzes and their
// results, question papers (with AI quiz drafting) and feedback from the principal. A teacher
// only ever sees their own classes, the learners in them, and their own quizzes and papers.
const fs = require('node:fs/promises');
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const ai = require('../lib/ai');
const { aiLimiter, rateLimit } = require('../lib/rateLimit');
const { catalog, t, langNote } = require('../lib/catalog');
const { riskFrom } = require('../lib/learners');
const { shortName, notify } = require('../lib/users');
const onlineClasses = require('../lib/onlineClasses');
const sms = require('../lib/sms');
const { documentText } = require('../lib/documentText');
const quizGen = require('../lib/quizGen');

// how many questions are made from an uploaded paper for the teacher to choose from
const GENERATED_QUESTIONS = 15;
// reading a scanned paper is heavy work for the server, so each teacher gets a few a minute
const quizFromPaperLimiter = rateLimit({ windowMs: 60 * 1000, max: 6, key: (req) => 'paper-quiz:' + req.user.id });
const liveRooms = require('../lib/liveRooms');
const { parseQuiz, teacherView } = require('../lib/quizzes');
const { paperUpload, checkFileType, filePath, removeFile } = require('../lib/uploads');
const { classView, teacherClassesFor, sendToClasses, classIdsOf, teachesLearner } = require('../lib/classes');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('teacher'));

// The teacher's classes, and the learners in them (or in one class, ?classId=, or one
// grade, ?grade=10) with their latest check-in quiz, their average on this teacher's tests
// (from each test's first try, so practice retakes don't inflate it), how many of those tests
// they have taken out of those set for their classes, and their status: at risk, watch or on
// track, from the tests (or the check-in until they have taken one; see riskFrom).
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
  const testsSet = new Map();
  if (learnerIds.length) {
    for (const r of await db.query(
      `SELECT cl.learner_id, COUNT(DISTINCT qc.quiz_id) AS n
         FROM class_learners cl
         JOIN quiz_classes qc ON qc.class_id = cl.class_id
         JOIN quizzes z ON z.id = qc.quiz_id AND z.teacher_id = ?
        WHERE cl.learner_id IN (?) GROUP BY cl.learner_id`,
      [req.user.id, learnerIds],
    )) testsSet.set(r.learner_id, Number(r.n));
  }
  res.json({
    classes: classes.map((c) => ({
      ...classView(c), learnerIds: members.filter((m) => m.class_id === c.id).map((m) => m.learner_id),
    })),
    learners: learners.map((l) => {
      const checkinPct = l.checkin_total ? l.checkin_score / l.checkin_total : null;
      const quizAverage = l.avg_pct == null ? null : Number(l.avg_pct);
      const risk = riskFrom({ testAverage: quizAverage, checkinPct });
      return {
        id: l.id, name: l.name, shortName: shortName(l.name), grade: l.grade, progress: l.progress,
        classIds: shown.filter((m) => m.learner_id === l.id).map((m) => m.class_id),
        status: risk.status,
        statusBasis: risk.basis,
        checkin: l.checkin_total ? { score: l.checkin_score, total: l.checkin_total, takenAt: l.checkin_at } : null,
        quizAverage: quizAverage == null ? null : Math.round(quizAverage * 100),
        quizAttempts: Number(l.attempts),
        testsSet: testsSet.get(l.id) || 0,
      };
    }),
  });
});

// only for a learner in one of this teacher's classes
router.post('/class/:learnerId/suggestion', aiLimiter, async (req, res) => {
  const learner = await db.one("SELECT * FROM users WHERE id = ? AND role = 'learner'", [http.id(req.params.learnerId, 'learnerId')]);
  if (!learner || !(await teachesLearner(req.user.id, learner.id))) throw http.notFound('learner_not_found', 'No such learner in your classes');
  const checkin = await db.one('SELECT score, total FROM checkin_attempts WHERE learner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [learner.id]);
  // the learner's first try at each of this teacher's tests, weakest first
  const tests = await db.query(
    `SELECT z.title, s.score, s.total FROM quiz_submissions s JOIN quizzes z ON z.id = s.quiz_id
      WHERE z.teacher_id = ? AND s.learner_id = ? AND NOT EXISTS (
        SELECT 1 FROM quiz_submissions e WHERE e.quiz_id = s.quiz_id AND e.learner_id = s.learner_id AND e.id < s.id)
      ORDER BY s.score / s.total, s.id`,
    [req.user.id, learner.id],
  );
  const testAverage = tests.length ? tests.reduce((a, r) => a + r.score / r.total, 0) / tests.length : null;
  const { status } = riskFrom({ testAverage, checkinPct: checkin ? checkin.score / checkin.total : null });
  const context = [
    `${t('grade_' + learner.grade)} learner, overall progress ${learner.progress}%`,
    tests.length
      ? `first-try results on the teacher's tests: ${tests.slice(0, 5).map((r) => `"${r.title}" ${r.score}/${r.total}`).join(', ')}`
      : 'has not taken any of the teacher\'s tests yet',
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

// the paper's text, read once (OCR for photos and scans) and kept on the paper
async function paperText(paper) {
  if (paper.extracted_text != null) return paper.extracted_text;
  const text = (await documentText(filePath(paper.stored_name), paper.mime_type)).slice(0, 200000);
  await db.query('UPDATE papers SET extracted_text = ? WHERE id = ?', [text, paper.id]);
  return text;
}

// Makes quiz questions from an uploaded question paper or study guide, for the teacher to tick the
// ones they want (nothing is saved here; publishing goes through POST /quizzes). Claude writes them,
// answers included, when AI is set up (ANTHROPIC_API_KEY). Otherwise, or if AI fails, they come from
// the document's text (OCR for photos and scans): a question paper's own questions (needsAnswer:
// the teacher types the memo's answer) and fill-in-the-missing-word questions from its sentences.
// Answers { source: 'ai' | 'text', questions: [{ text, answer, needsAnswer? }], classIds, title }.
router.post('/papers/:id/generate-quiz', quizFromPaperLimiter, async (req, res) => {
  const paper = await ownPaper(req);
  let questions = [];
  let source = 'ai';
  if (aiLimiter.allows(req)) {
    try {
      const isFile = paper.mime_type === 'application/pdf' || paper.mime_type.startsWith('image/');
      questions = await ai.quizFromPaper({
        ...(isFile
          ? { fileBase64: (await fs.readFile(filePath(paper.stored_name))).toString('base64'), mimeType: paper.mime_type }
          : { text: (await paperText(paper)).slice(0, 60000) }),
        max: GENERATED_QUESTIONS,
        prompt: `This is a ${t('grade_' + paper.grade)} ${t(paper.subject_key)} question paper or study guide titled ` +
          `"${paper.title}". Write up to ${GENERATED_QUESTIONS} short-answer quiz questions from it for learners to ` +
          'practise with. If it is a question paper, base them on its questions; if it is study material, ask about its ' +
          'key facts, terms and definitions. Each answer must be short (one to four words, or a number), because ' +
          'learners type it and it is marked by exact match. Write in the language the document is written in.',
      });
    } catch (err) {
      if (!(err instanceof http.HttpError)) throw err;
      questions = []; // AI not set up, busy or failed: write them from the text instead
    }
  }
  if (questions.length === 0) {
    source = 'text';
    const text = await paperText(paper);
    questions = [...quizGen.paperQuestions(text), ...quizGen.fromText(text, { max: GENERATED_QUESTIONS })];
  }
  if (questions.length === 0) {
    throw new http.HttpError(422, 'paper_ocr_empty', 'No quiz questions could be made from this file');
  }
  const classIds = (await classIdsOf('paper', [paper.id])).get(paper.id);
  res.json({ source, title: paper.title, classIds, questions });
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

// ---- online classes and their register ----

async function ownOnlineClass(req) {
  const oc = await db.one(`${onlineClasses.SELECT} WHERE oc.id = ? AND oc.teacher_id = ?`, [http.id(req.params.id), req.user.id]);
  if (!oc) throw http.notFound('online_class_not_found', 'No such online class');
  return oc;
}

// Every learner now in the class, with their register entry (status null: has not come in),
// the minutes they have spent in the classroom, and whether they are in it right now.
async function registerOf(oc) {
  const rows = await db.query(
    `SELECT u.id, u.name, a.status, a.joined_at, a.last_joined_at, a.seconds_attended, a.marked_by
       FROM class_learners cl JOIN users u ON u.id = cl.learner_id
       LEFT JOIN online_attendance a ON a.online_class_id = ? AND a.learner_id = u.id
      WHERE cl.class_id = ? ORDER BY u.name`,
    [oc.id, oc.class_id],
  );
  const here = new Set(liveRooms.presentIds(oc.id));
  return rows.map((r) => ({
    learnerId: r.id, name: r.name, status: r.status, joinedAt: r.joined_at, markedBy: r.marked_by,
    minutes: onlineClasses.minutesAttended(r), inRoom: here.has(r.id),
  }));
}

function teacherOnlineView(oc, counts) {
  const c = counts.get(oc.id) || { present: 0, late: 0 };
  return { ...onlineClasses.view(oc), present: c.present, late: c.late, learners: c.learners || 0 };
}

router.get('/online-classes', async (req, res) => {
  const rows = await db.query(`${onlineClasses.SELECT} WHERE oc.teacher_id = ? ORDER BY oc.starts_at DESC, oc.id DESC LIMIT 100`, [req.user.id]);
  const counts = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    for (const r of await db.query(
      `SELECT online_class_id AS id, SUM(status = 'present') AS present, SUM(status = 'late') AS late
         FROM online_attendance WHERE online_class_id IN (?) GROUP BY online_class_id`, [ids])) {
      counts.set(r.id, { present: Number(r.present), late: Number(r.late) });
    }
    for (const r of await db.query(
      `SELECT oc.id, COUNT(cl.learner_id) AS n FROM online_classes oc
         LEFT JOIN class_learners cl ON cl.class_id = oc.class_id WHERE oc.id IN (?) GROUP BY oc.id`, [ids])) {
      counts.set(r.id, { present: 0, late: 0, ...counts.get(r.id), learners: Number(r.n) });
    }
  }
  res.json({ onlineClasses: rows.map((oc) => teacherOnlineView(oc, counts)) });
});

// Body: { classId, title, startsAt (ISO date-time), durationMin }. The learners in the class
// are told about it.
router.post('/online-classes', async (req, res) => {
  const b = http.body(req);
  const klass = await db.one('SELECT * FROM classes WHERE id = ? AND teacher_id = ?', [http.id(b.classId, 'classId'), req.user.id]);
  if (!klass) throw http.notFound('class_not_found', 'No such class among yours');
  const fields = {
    class_id: klass.id,
    teacher_id: req.user.id,
    title: http.text(b.title, 'title', { max: 150 }),
    starts_at: onlineClasses.startsAt(b.startsAt),
    duration_min: onlineClasses.duration(b.durationMin),
  };
  let learnerIds = [];
  const id = await db.tx(async (conn) => {
    const result = await db.query('INSERT INTO online_classes SET ?', [fields], conn);
    const learners = await db.query('SELECT learner_id FROM class_learners WHERE class_id = ?', [klass.id], conn);
    learnerIds = learners.map((l) => l.learner_id);
    await notify(learnerIds, {
      message: `${req.user.name} scheduled an online class for ${klass.name} ${t(klass.subject_key)}: "${fields.title}".`,
    }, conn);
    return result.insertId;
  });
  // a text reminder to the learners with a phone number on file (not waited for)
  const when = fields.starts_at.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  sms.phonesOf(learnerIds)
    .then((phones) => sms.sendQuietly(phones, `Smart Learning: ${req.user.name} scheduled an online class for ${klass.name} ` +
      `${t(klass.subject_key)}: "${fields.title}" on ${when} (${fields.duration_min} min). Join it in the Smart Learning app.`))
    .catch((err) => console.error('[sms] class reminder:', err.message));
  const oc = await onlineClasses.find(id);
  res.status(201).json({ onlineClass: teacherOnlineView(oc, new Map()) });
});

router.get('/online-classes/:id/register', async (req, res) => {
  const oc = await ownOnlineClass(req);
  res.json({ onlineClass: teacherOnlineView(oc, new Map()), register: await registerOf(oc) });
});

// the teacher marks a learner present, late or absent, or (status null) clears their mark
router.put('/online-classes/:id/register/:learnerId', async (req, res) => {
  const oc = await ownOnlineClass(req);
  const learnerId = http.id(req.params.learnerId, 'learnerId');
  if (!(await db.one('SELECT 1 FROM class_learners WHERE class_id = ? AND learner_id = ?', [oc.class_id, learnerId]))) {
    throw http.notFound('learner_not_found', 'No such learner in this class');
  }
  const status = http.body(req).status;
  if (status === null) {
    await db.query('DELETE FROM online_attendance WHERE online_class_id = ? AND learner_id = ?', [oc.id, learnerId]);
  } else {
    await db.query(
      `INSERT INTO online_attendance (online_class_id, learner_id, status, marked_by) VALUES (?, ?, ?, 'teacher')
       ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = 'teacher'`,
      [oc.id, learnerId, http.oneOf(status, onlineClasses.ATTENDANCE, 'status')],
    );
  }
  res.json({ register: await registerOf(oc) });
});

// ends the class now: the classroom closes for everyone in it
router.post('/online-classes/:id/end', async (req, res) => {
  const oc = await ownOnlineClass(req);
  if (onlineClasses.phase(oc) !== 'ended') await db.query('UPDATE online_classes SET ended_at = UTC_TIMESTAMP() WHERE id = ?', [oc.id]);
  liveRooms.end(oc.id);
  res.json({ onlineClass: teacherOnlineView(await onlineClasses.find(oc.id), new Map()) });
});

// cancels the class, and its register with it
router.delete('/online-classes/:id', async (req, res) => {
  const oc = await ownOnlineClass(req);
  liveRooms.end(oc.id);
  await db.query('DELETE FROM online_classes WHERE id = ?', [oc.id]);
  res.status(204).end();
});

module.exports = router;
