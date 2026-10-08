// /api/admin: the school administrator creates every account (teachers, parents, HODs and
// principals can't sign up), links parents to learners, issues temporary passwords and
// sees the school overview.
const express = require('express');
const config = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { catalog, deptForSubject } = require('../lib/catalog');
const { ensureLessons } = require('../lib/learners');
const { publicUser, findByEmail, findById } = require('../lib/users');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('admin'));

// role-specific details, from the add-user form or an edit; only the fields sent are returned
function roleDetails(role, b, { partial = false } = {}) {
  const has = (k) => !partial || k in b;
  const d = {};
  if (role === 'learner') {
    if (has('grade')) d.grade = http.oneOf(String(b.grade), catalog.GRADES, 'grade');
    if ('idNumber' in b) d.id_number = http.text(b.idNumber, 'idNumber', { max: 30, required: false }) || null;
  }
  if (role === 'teacher') {
    if (has('subjectKey')) {
      d.subject_key = http.oneOf(b.subjectKey, catalog.SUBJECT_OPTIONS, 'subjectKey');
      d.dept = deptForSubject(d.subject_key);
    }
    if ('teachGrade' in b) d.teach_grade = b.teachGrade == null || b.teachGrade === '' ? null : http.oneOf(String(b.teachGrade), catalog.GRADES, 'teachGrade');
    if ('staffNumber' in b) d.staff_number = http.text(b.staffNumber, 'staffNumber', { max: 30, required: false }) || null;
    if ('attendance' in b) d.attendance = b.attendance == null ? null : http.int(b.attendance, 'attendance', { min: 0, max: 100 });
    if ('performance' in b) d.performance = b.performance == null ? null : http.int(b.performance, 'performance', { min: 0, max: 100 });
  }
  if (role === 'hod' && has('dept')) d.dept = http.oneOf(b.dept, catalog.DEPARTMENTS.map((x) => x.id), 'dept');
  return d;
}

async function withLinks(users) {
  const links = await db.query('SELECT parent_id, learner_id FROM parent_children');
  return users.map((u) => {
    const out = publicUser(u);
    if (u.role === 'parent') out.childIds = links.filter((l) => l.parent_id === u.id).map((l) => l.learner_id);
    if (u.role === 'learner') out.parentIds = links.filter((l) => l.learner_id === u.id).map((l) => l.parent_id);
    return out;
  });
}

function invite(user, tempPassword) {
  return { name: user.name, email: user.email, role: user.role, tempPassword, loginUrl: config.appUrl };
}

async function requireUser(id, role) {
  const user = await findById(id);
  if (!user || (role && user.role !== role)) throw http.notFound('user_not_found', 'No such ' + (role || 'user'));
  return user;
}

// ?role=teacher&q=search narrows the list
router.get('/users', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.role && req.query.role !== 'all') {
    where.push('role = ?');
    params.push(http.oneOf(req.query.role, catalog.ROLES, 'role'));
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    where.push('(name LIKE ? OR email LIKE ?)');
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    params.push(like, like);
  }
  const rows = await db.query(`SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY role, name`, params);
  const { total } = await db.one('SELECT COUNT(*) AS total FROM users');
  res.json({ users: await withLinks(rows), total });
});

// creates the account with a temporary password; the response carries the invite to email them
router.post('/users', async (req, res) => {
  const b = http.body(req);
  const role = http.oneOf(b.role, catalog.ROLES, 'role');
  const fields = {
    name: http.text(b.name, 'name', { max: 100 }),
    email: http.email(b.email),
    role,
    ...roleDetails(role, b),
  };
  const childId = role === 'parent' && b.childId ? http.id(b.childId, 'childId') : null;
  if (await findByEmail(fields.email)) throw http.conflict('admin_error_email_taken', 'An account with this email already exists');
  if (childId) await requireUser(childId, 'learner');

  const tempPassword = auth.generateTempPassword();
  fields.password_hash = await auth.hashPassword(tempPassword);
  fields.must_change_password = 1;
  const user = await db.tx(async (conn) => {
    const result = await db.query('INSERT INTO users SET ?', [fields], conn);
    if (role === 'learner') await ensureLessons(result.insertId, conn);
    if (childId) await db.query('INSERT INTO parent_children (parent_id, learner_id) VALUES (?, ?)', [result.insertId, childId], conn);
    return db.one('SELECT * FROM users WHERE id = ?', [result.insertId], conn);
  });
  const [out] = await withLinks([user]);
  res.status(201).json({ user: out, invite: invite(user, tempPassword) });
});

router.patch('/users/:id', async (req, res) => {
  const user = await requireUser(http.id(req.params.id));
  const b = http.body(req);
  const updates = roleDetails(user.role, b, { partial: true });
  if ('name' in b) updates.name = http.text(b.name, 'name', { max: 100 });
  if ('phone' in b) updates.phone = http.text(b.phone, 'phone', { max: 30, required: false }) || null;
  if ('email' in b) {
    updates.email = http.email(b.email);
    const other = await findByEmail(updates.email);
    if (other && other.id !== user.id) throw http.conflict('admin_error_email_taken', 'Another account already uses this email');
  }
  if (Object.keys(updates).length) await db.query('UPDATE users SET ? WHERE id = ?', [updates, user.id]);
  const [out] = await withLinks([await findById(user.id)]);
  res.json({ user: out });
});

// a removed learner disappears from every parent it was linked to (the link rows cascade)
router.delete('/users/:id', async (req, res) => {
  const user = await requireUser(http.id(req.params.id));
  if (user.id === req.user.id) throw http.badRequest('admin_error_delete_self', 'You cannot remove your own account');
  await db.query('DELETE FROM users WHERE id = ?', [user.id]);
  res.status(204).end();
});

// issues a fresh temporary password (logging out their sessions) and returns the invite again
router.post('/users/:id/reset-login', async (req, res) => {
  const user = await requireUser(http.id(req.params.id));
  const tempPassword = auth.generateTempPassword();
  await db.query(
    'UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?',
    [await auth.hashPassword(tempPassword), user.id],
  );
  res.json({ invite: invite(user, tempPassword) });
});

// pairs a parent with a learner: the parent then sees only their linked children's progress
router.post('/parents/:id/children', async (req, res) => {
  const parent = await requireUser(http.id(req.params.id), 'parent');
  const learner = await requireUser(http.id(http.body(req).learnerId, 'learnerId'), 'learner');
  await db.query('INSERT IGNORE INTO parent_children (parent_id, learner_id) VALUES (?, ?)', [parent.id, learner.id]);
  const [out] = await withLinks([parent]);
  res.json({ user: out });
});

router.delete('/parents/:id/children/:learnerId', async (req, res) => {
  const parent = await requireUser(http.id(req.params.id), 'parent');
  await db.query('DELETE FROM parent_children WHERE parent_id = ? AND learner_id = ?', [parent.id, http.id(req.params.learnerId, 'learnerId')]);
  const [out] = await withLinks([parent]);
  res.json({ user: out });
});

router.get('/overview', async (req, res) => {
  const counts = Object.fromEntries(catalog.ROLES.map((r) => [r, 0]));
  for (const row of await db.query('SELECT role, COUNT(*) AS n FROM users GROUP BY role')) counts[row.role] = row.n;
  const subjects = await db.query('SELECT subject_key AS `key`, attendance, performance FROM subject_stats ORDER BY subject_key');
  const quizzes = await db.one(
    `SELECT (SELECT COUNT(*) FROM quizzes) AS quizzes,
            (SELECT COUNT(*) FROM quiz_attempts WHERE submitted_at IS NOT NULL) AS quizAttempts,
            (SELECT COUNT(*) FROM papers) AS papers`,
  );
  res.json({ counts, totalUsers: Object.values(counts).reduce((a, b) => a + b, 0), subjects, ...quizzes });
});

module.exports = router;
