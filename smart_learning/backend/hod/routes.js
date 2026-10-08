// /api/hod: the Head of Department sees the teachers in their own department, records
// whether interventions are done, gets AI coaching ideas and sends reports to the principal.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const ai = require('../lib/ai');
const { aiLimiter } = require('../lib/rateLimit');
const { t, langNote } = require('../lib/catalog');
const { listTeachers, getTeacher } = require('../lib/teachers');
const { notify } = require('../lib/users');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('hod'));

async function deptTeacher(req) {
  const teacher = await getTeacher(http.id(req.params.id));
  if (!teacher || teacher.dept !== req.user.dept) throw http.notFound('teacher_not_found', 'No such teacher in your department');
  return teacher;
}

function workDoneValue(b) {
  if (!('workDone' in b) || ![true, false, null].includes(b.workDone)) {
    throw http.badRequest('invalid_field', 'workDone must be true, false or null', { field: 'workDone' });
  }
  return b.workDone;
}

router.get('/teachers', async (req, res) => {
  res.json({ dept: req.user.dept, teachers: await listTeachers({ dept: req.user.dept }) });
});

router.patch('/teachers/:id/work-done', async (req, res) => {
  const teacher = await deptTeacher(req);
  await db.query('UPDATE users SET work_done = ? WHERE id = ?', [workDoneValue(http.body(req)), teacher.id]);
  res.json({ teacher: await getTeacher(teacher.id) });
});

router.post('/teachers/:id/suggestion', aiLimiter, async (req, res) => {
  const teacher = await deptTeacher(req);
  const rating = teacher.ratings.average == null ? 'no learner ratings yet'
    : `an average learner rating of ${teacher.ratings.average.toFixed(1)}/5 from ${teacher.ratings.count} responses`;
  const suggestion = await ai.askOneLiner(
    `${teacher.name} teaches ${teacher.gradeKey ? t(teacher.gradeKey) + ' ' : ''}${t(teacher.subjectKey)} at a school on a ` +
    `platform called Smart Learning, and has ${rating}. In ONE short, practical sentence (max 25 words), suggest a concrete ` +
    `area of support or coaching the Head of Department could offer this teacher.${langNote(http.body(req).lang)}`,
  );
  res.json({ suggestion });
});

// compiles attendance, performance and ratings for every teacher in the department into a
// report on the principal's dashboard
router.post('/reports', async (req, res) => {
  const teachers = await listTeachers({ dept: req.user.dept });
  const rows = teachers.map((tc) => ({
    teacherId: tc.id, name: tc.name, subjectKey: tc.subjectKey, gradeKey: tc.gradeKey,
    attendance: tc.attendance, performance: tc.performance, avgRating: tc.ratings.average,
  }));
  const report = await db.tx(async (conn) => {
    const result = await db.query('INSERT INTO dept_reports (hod_id, dept, `rows`) VALUES (?, ?, ?)',
      [req.user.id, req.user.dept, JSON.stringify(rows)], conn);
    const principals = await db.query("SELECT id FROM users WHERE role = 'principal'", [], conn);
    await notify(principals.map((p) => p.id), { message: `${req.user.name} sent a department report.` }, conn);
    return db.one('SELECT * FROM dept_reports WHERE id = ?', [result.insertId], conn);
  });
  res.status(201).json({ report: reportView(report) });
});

router.get('/reports', async (req, res) => {
  const rows = await db.query('SELECT * FROM dept_reports WHERE hod_id = ? ORDER BY sent_at DESC, id DESC', [req.user.id]);
  res.json({ reports: rows.map(reportView) });
});

function reportView(r) {
  return { id: r.id, dept: r.dept, sentAt: r.sent_at, hodId: r.hod_id, hodName: r.hod_name, rows: r.rows };
}

module.exports = router;
module.exports.reportView = reportView;
