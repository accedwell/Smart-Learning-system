// /api/admin: the school administrator creates every account (nobody signs up), links
// parents to learners, sets up the classes, issues temporary passwords and sees the school
// overview.
const express = require('express');
const config = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { catalog, deptForSubject } = require('../lib/catalog');
const { ensureLessons } = require('../lib/learners');
const { publicUser, findByEmail, findById } = require('../lib/users');
const { classView } = require('../lib/classes');
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
  // a learner moved to another grade leaves the classes of their old grade
  if (user.role === 'learner' && updates.grade && updates.grade !== user.grade) {
    await db.query('DELETE cl FROM class_learners cl JOIN classes k ON k.id = cl.class_id WHERE cl.learner_id = ? AND k.grade <> ?',
      [user.id, updates.grade]);
  }
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

// ---- classes (subject groups): a name like 10A, a grade, a subject, a teacher and learners ----

const CLASS_SELECT = 'SELECT k.*, u.name AS teacher_name FROM classes k LEFT JOIN users u ON u.id = k.teacher_id';

async function classViews(rows) {
  const members = rows.length === 0 ? [] : await db.query(
    'SELECT class_id, learner_id FROM class_learners WHERE class_id IN (?) ORDER BY learner_id', [rows.map((c) => c.id)],
  );
  return rows.map((c) => ({
    ...classView(c), teacherName: c.teacher_name || null,
    learnerIds: members.filter((m) => m.class_id === c.id).map((m) => m.learner_id),
  }));
}

async function classById(id) {
  const [out] = await classViews([await db.one(`${CLASS_SELECT} WHERE k.id = ?`, [id])]);
  return out;
}

async function requireClass(id) {
  const c = await db.one('SELECT * FROM classes WHERE id = ?', [id]);
  if (!c) throw http.notFound('class_not_found', 'No such class');
  return c;
}

// "10a " -> "10A"
const className = (value) => http.text(value, 'name', { max: 10 }).toUpperCase();

async function teacherIdFrom(value) {
  if (value == null || value === '') return null;
  return (await requireUser(http.id(value, 'teacherId'), 'teacher')).id;
}

// a second class with the same grade, name and subject is refused
async function uniqueClass(write) {
  try {
    return await write();
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw http.conflict('admin_class_error_taken', 'That class already exists for this grade and subject');
    throw err;
  }
}

router.get('/classes', async (req, res) => {
  res.json({ classes: await classViews(await db.query(`${CLASS_SELECT} ORDER BY k.grade, k.name, k.subject_key`)) });
});

// { name: '10A', grade, subjectKey, teacherId (optional) }
router.post('/classes', async (req, res) => {
  const b = http.body(req);
  const fields = {
    name: className(b.name),
    grade: http.oneOf(String(b.grade), catalog.GRADES, 'grade'),
    subject_key: http.oneOf(b.subjectKey, catalog.SUBJECT_OPTIONS, 'subjectKey'),
    teacher_id: await teacherIdFrom(b.teacherId),
  };
  const result = await uniqueClass(() => db.query('INSERT INTO classes SET ?', [fields]));
  res.status(201).json({ class: await classById(result.insertId) });
});

// renames the class or changes its teacher (null for none); its grade and subject stay
router.patch('/classes/:id', async (req, res) => {
  const c = await requireClass(http.id(req.params.id));
  const b = http.body(req);
  const updates = {};
  if ('name' in b) updates.name = className(b.name);
  if ('teacherId' in b) updates.teacher_id = await teacherIdFrom(b.teacherId);
  if (Object.keys(updates).length) await uniqueClass(() => db.query('UPDATE classes SET ? WHERE id = ?', [updates, c.id]));
  res.json({ class: await classById(c.id) });
});

// quizzes and papers sent to it stop going to it; any other classes keep them
router.delete('/classes/:id', async (req, res) => {
  const c = await requireClass(http.id(req.params.id));
  await db.query('DELETE FROM classes WHERE id = ?', [c.id]);
  res.status(204).end();
});

// a learner can only join a class of their own grade
router.put('/classes/:id/learners/:learnerId', async (req, res) => {
  const c = await requireClass(http.id(req.params.id));
  const learner = await requireUser(http.id(req.params.learnerId, 'learnerId'), 'learner');
  if (learner.grade !== c.grade) throw http.badRequest('admin_class_error_grade', 'This learner is in another grade', { field: 'learnerId' });
  await db.query('INSERT IGNORE INTO class_learners (class_id, learner_id) VALUES (?, ?)', [c.id, learner.id]);
  res.json({ class: await classById(c.id) });
});

router.delete('/classes/:id/learners/:learnerId', async (req, res) => {
  const c = await requireClass(http.id(req.params.id));
  await db.query('DELETE FROM class_learners WHERE class_id = ? AND learner_id = ?', [c.id, http.id(req.params.learnerId, 'learnerId')]);
  res.json({ class: await classById(c.id) });
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
