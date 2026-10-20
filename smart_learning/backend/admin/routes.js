// /api/admin: the school administrator creates every account (nobody signs up), links
// parents to learners, sets up the classes, issues temporary passwords and sees the school
// overview.
const express = require('express');
const config = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { catalog, deptForSubject } = require('../lib/catalog');
const { ensureLessons, refreshProgress } = require('../lib/learners');
const { checkLearnerSubjects, subjectsOf, subjectsByLearner, setSubjects } = require('../lib/subjects');
const { publicUser, findByEmail, findById, findByIdNumber, parentsWithEmail } = require('../lib/users');
const { normalizeIdNumber } = require('../lib/idNumber');
const { classView } = require('../lib/classes');
const mailer = require('../lib/mailer');
const { rateLimit } = require('../lib/rateLimit');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('admin'));

// role-specific details, from the add-user form or an edit; only the fields sent are returned
function roleDetails(role, b, { partial = false } = {}) {
  const has = (k) => !partial || k in b;
  const d = {};
  if (role === 'learner') {
    if (has('grade')) d.grade = http.oneOf(String(b.grade), catalog.GRADES, 'grade');
    if ('idNumber' in b) {
      d.id_number = normalizeIdNumber(b.idNumber);
      if (!d.id_number) throw http.badRequest('admin_error_id_number', 'Enter a valid 13-digit South African ID number', { field: 'idNumber' });
    }
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
  const subjects = await subjectsByLearner(users.filter((u) => u.role === 'learner').map((u) => u.id));
  return users.map((u) => {
    const out = publicUser(u);
    if (u.role === 'parent') out.childIds = links.filter((l) => l.parent_id === u.id).map((l) => l.learner_id);
    if (u.role === 'learner') {
      out.parentIds = links.filter((l) => l.learner_id === u.id).map((l) => l.parent_id);
      out.subjects = subjects.get(u.id) || [];
    }
    return out;
  });
}

// one account per ID number
async function checkIdNumberFree(idNumber, exceptId) {
  const other = await findByIdNumber(idNumber);
  if (other && other.id !== exceptId) throw http.conflict('admin_error_id_taken', 'Another learner already has this ID number');
}

// The login details to pass on. A learner added with their ID number has no email: their
// details go to their parent's email (`email`), together with the parent's own login when the
// parent's account is new too (`newParent` = { user, tempPassword }).
async function invite(user, tempPassword, newParent) {
  const out = { userId: user.id, name: user.name, role: user.role, tempPassword, loginUrl: config.appUrl, email: user.email || null };
  if (user.role !== 'learner' || user.email) return out;
  const parent = newParent ? newParent.user : (await parentsWithEmail(user.id))[0];
  return {
    ...out,
    idNumber: user.id_number,
    email: parent ? parent.email : null,
    parent: parent ? { userId: parent.id, name: parent.name, email: parent.email, tempPassword: newParent ? newParent.tempPassword : null } : null,
  };
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
    where.push('(name LIKE ? OR email LIKE ? OR id_number LIKE ?)');
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    params.push(like, like, like);
  }
  const rows = await db.query(`SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY role, name`, params);
  const { total } = await db.one('SELECT COUNT(*) AS total FROM users');
  res.json({ users: await withLinks(rows), total });
});

// Creates the account with a temporary password; the response carries the invite to email them.
// A learner is added with their ID number (no email) and must be linked to a parent: one already
// in the system (`parentId`), or a new one created with them (`parent: { name, email }`). Their
// login details then go to that parent's email.
router.post('/users', async (req, res) => {
  const b = http.body(req);
  const role = http.oneOf(b.role, catalog.ROLES, 'role');
  const learner = role === 'learner';
  const fields = { name: http.text(b.name, 'name', { max: 100 }), role, ...roleDetails(role, b) };
  let parentId = null;
  let newParent = null;
  let subjects = null;
  if (learner) {
    if (!fields.id_number) throw http.badRequest('admin_error_id_number', 'Enter a valid 13-digit South African ID number', { field: 'idNumber' });
    subjects = checkLearnerSubjects(b.subjects);
    await checkIdNumberFree(fields.id_number);
    if (b.parentId) {
      parentId = (await requireUser(http.id(b.parentId, 'parentId'), 'parent')).id;
    } else if (b.parent && typeof b.parent === 'object') {
      newParent = { name: http.text(b.parent.name, 'parentName', { max: 100 }), email: http.email(b.parent.email), role: 'parent' };
      if (await findByEmail(newParent.email)) throw http.conflict('admin_error_email_taken', 'An account with this email already exists');
    } else {
      throw http.badRequest('admin_error_parent_required', 'A learner must be linked to a parent', { field: 'parent' });
    }
  } else {
    fields.email = http.email(b.email);
    if (await findByEmail(fields.email)) throw http.conflict('admin_error_email_taken', 'An account with this email already exists');
  }
  const childId = role === 'parent' && b.childId ? http.id(b.childId, 'childId') : null;
  if (childId) await requireUser(childId, 'learner');

  const tempPassword = auth.generateTempPassword();
  fields.password_hash = await auth.hashPassword(tempPassword);
  fields.must_change_password = 1;
  const parentPassword = newParent ? auth.generateTempPassword() : null;
  if (newParent) Object.assign(newParent, { password_hash: await auth.hashPassword(parentPassword), must_change_password: 1 });

  const { user, parent } = await db.tx(async (conn) => {
    const result = await db.query('INSERT INTO users SET ?', [fields], conn);
    if (learner) {
      await setSubjects(result.insertId, subjects, conn);
      await ensureLessons(result.insertId, conn);
    }
    if (childId) await db.query('INSERT INTO parent_children (parent_id, learner_id) VALUES (?, ?)', [result.insertId, childId], conn);
    let pid = parentId;
    if (newParent) pid = (await db.query('INSERT INTO users SET ?', [newParent], conn)).insertId;
    if (pid) await db.query('INSERT INTO parent_children (parent_id, learner_id) VALUES (?, ?)', [pid, result.insertId], conn);
    return {
      user: await db.one('SELECT * FROM users WHERE id = ?', [result.insertId], conn),
      parent: pid ? await db.one('SELECT * FROM users WHERE id = ?', [pid], conn) : null,
    };
  });
  const [out, parentOut] = await withLinks(parent ? [user, parent] : [user]);
  res.status(201).json({
    user: out,
    parent: parentOut || null,
    invite: await invite(user, tempPassword, newParent ? { user: parent, tempPassword: parentPassword } : null),
  });
});

router.patch('/users/:id', async (req, res) => {
  const user = await requireUser(http.id(req.params.id));
  const b = http.body(req);
  const updates = roleDetails(user.role, b, { partial: true });
  if (updates.id_number) await checkIdNumberFree(updates.id_number, user.id);
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

// a learner's 7 subjects: their lessons follow (a lesson per subject; marks on subjects they
// keep stay as they are)
router.put('/users/:id/subjects', async (req, res) => {
  const learner = await requireUser(http.id(req.params.id), 'learner');
  const subjects = checkLearnerSubjects(http.body(req).subjects);
  await db.tx(async (conn) => {
    await setSubjects(learner.id, subjects, conn);
    await ensureLessons(learner.id, conn);
    await refreshProgress(learner.id, conn);
  });
  const [out] = await withLinks([await findById(learner.id)]);
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
  res.json({ invite: await invite(user, tempPassword) });
});

// Emails someone their login details (the "Send email" button after adding a user or resetting
// a login). Body: { tempPassword } as shown to the administrator. Only the account's current
// temporary password is sent, so old details can't go out by mistake.
const emailLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => 'invite-email:' + req.user.id });
// For a learner without an email, the email goes to their parent, with { parentId,
// parentTempPassword } adding the parent's own login when that account is new too.
const stillTemporary = async (user, password) =>
  Boolean(user.must_change_password) && typeof password === 'string' && auth.verifyPassword(password, user.password_hash);
const staleDetails = () => http.conflict('invite_password_stale', 'These login details are out of date; make new ones with Resend login');

router.post('/users/:id/email-login', emailLimiter, async (req, res) => {
  const user = await requireUser(http.id(req.params.id));
  const b = http.body(req);
  if (!(await stillTemporary(user, b.tempPassword))) throw staleDetails();

  let send;
  let to;
  if (user.role === 'learner' && !user.email) {
    const parents = await parentsWithEmail(user.id);
    const parent = parents.find((p) => p.id === Number(b.parentId)) || parents[0];
    if (!parent) throw http.badRequest('admin_error_no_parent_email', 'Link this learner to a parent with an email address first');
    let parentPassword = null;
    if (b.parentTempPassword) {
      if (!(await stillTemporary(parent, b.parentTempPassword))) throw staleDetails();
      parentPassword = b.parentTempPassword;
    }
    send = () => mailer.sendFamilyLoginDetails(parent, user, b.tempPassword, parentPassword, config.appUrl);
    to = parent.email;
  } else {
    send = () => mailer.sendLoginDetails(user, b.tempPassword, config.appUrl);
    to = user.email;
  }
  try {
    await send();
  } catch (err) {
    console.error(`[admin] could not email the login details to ${to}: ${err.message}`);
    throw new http.HttpError(502, 'email_failed', 'The email could not be sent');
  }
  res.json({ sent: mailer.configured(), email: to });
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
  // a class is one subject: only for learners who take it (learners without subjects yet are let in)
  const taken = await subjectsOf(learner.id);
  if (taken.length && !taken.includes(c.subject_key)) {
    throw http.badRequest('admin_class_error_subject', 'This learner does not take this subject', { field: 'learnerId' });
  }
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
            (SELECT COUNT(*) FROM papers) AS papers,
            (SELECT COUNT(*) FROM users WHERE must_change_password = 1) AS awaitingFirstLogin`,
  );
  res.json({ counts, totalUsers: Object.values(counts).reduce((a, b) => a + b, 0), subjects, ...quizzes });
});

module.exports = router;
