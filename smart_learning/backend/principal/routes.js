// /api/principal: every teacher's attendance, performance and ratings, oversight of
// assigned interventions, feedback to teachers, and the HODs' department reports.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { listTeachers, getTeacher } = require('../lib/teachers');
const { notify } = require('../lib/users');
const { reportView } = require('../hod/routes');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('principal'));

async function requireTeacher(req) {
  const teacher = await getTeacher(http.id(req.params.id));
  if (!teacher) throw http.notFound('teacher_not_found', 'No such teacher');
  return teacher;
}

router.get('/teachers', async (req, res) => {
  res.json({ teachers: await listTeachers() });
});

router.get('/teachers/:id', async (req, res) => {
  const teacher = await requireTeacher(req);
  const feedback = await db.query('SELECT id, message, created_at FROM teacher_feedback WHERE teacher_id = ? ORDER BY created_at DESC', [teacher.id]);
  res.json({ teacher, feedback: feedback.map((f) => ({ id: f.id, message: f.message, sentAt: f.created_at })) });
});

router.patch('/teachers/:id/work-done', async (req, res) => {
  const teacher = await requireTeacher(req);
  const b = http.body(req);
  if (!('workDone' in b) || ![true, false, null].includes(b.workDone)) {
    throw http.badRequest('invalid_field', 'workDone must be true, false or null', { field: 'workDone' });
  }
  await db.query('UPDATE users SET work_done = ? WHERE id = ?', [b.workDone, teacher.id]);
  res.json({ teacher: await getTeacher(teacher.id) });
});

// the teacher sees it under their feedback and gets a notification
router.post('/teachers/:id/feedback', async (req, res) => {
  const teacher = await requireTeacher(req);
  const message = http.text(http.body(req).message, 'message', { max: 2000 });
  const id = await db.tx(async (conn) => {
    const result = await db.query('INSERT INTO teacher_feedback (teacher_id, from_user_id, message) VALUES (?, ?, ?)',
      [teacher.id, req.user.id, message], conn);
    await notify([teacher.id], { message: `${req.user.name} sent you feedback.` }, conn);
    return result.insertId;
  });
  res.status(201).json({ feedback: { id, teacherId: teacher.id, message } });
});

router.get('/reports', async (req, res) => {
  const rows = await db.query(
    `SELECT r.*, u.name AS hod_name FROM dept_reports r LEFT JOIN users u ON u.id = r.hod_id
      ORDER BY r.sent_at DESC, r.id DESC`,
  );
  res.json({ reports: rows.map(reportView) });
});

module.exports = router;
