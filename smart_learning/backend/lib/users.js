// Turning user rows into API objects, plus lookups several routers need.
const db = require('./db');
const { normalizeIdNumber, looksLikeIdNumber } = require('./idNumber');

const bool = (v) => (v == null ? null : Boolean(v));

// the fields any logged-in user may see about an account (never the password hash)
function publicUser(u) {
  const out = {
    id: u.id,
    name: u.name,
    email: u.email || '', // learners added by ID number have none
    role: u.role,
    phone: u.phone || '',
    mustChangePassword: Boolean(u.must_change_password),
    locked: Boolean(u.locked_until && new Date(u.locked_until) > new Date()), // after too many wrong passwords
    createdAt: u.created_at,
  };
  if (u.role === 'learner') Object.assign(out, { grade: u.grade, className: u.class_name || '', idNumber: u.id_number || '', progress: u.progress });
  if (u.role === 'teacher') {
    Object.assign(out, {
      subjectKey: u.subject_key, dept: u.dept, staffNumber: u.staff_number || '',
      gradeKey: u.teach_grade ? 'grade_' + u.teach_grade : null,
    });
  }
  if (u.role === 'hod') out.dept = u.dept;
  return out;
}

async function findByEmail(email, conn) {
  return db.one('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()], conn);
}

async function findByIdNumber(idNumber, conn) {
  return db.one('SELECT * FROM users WHERE id_number = ?', [idNumber], conn);
}

// the account for what someone typed on the login screen: an email address, or (learners)
// an ID number
async function findByLogin(value, conn) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (looksLikeIdNumber(text)) {
    const idNumber = normalizeIdNumber(text);
    return idNumber ? findByIdNumber(idNumber, conn) : null;
  }
  return findByEmail(text, conn);
}

// the parents of a learner who can be emailed (name and address)
async function parentsWithEmail(learnerId, conn) {
  return db.query(
    `SELECT u.* FROM parent_children pc JOIN users u ON u.id = pc.parent_id
      WHERE pc.learner_id = ? AND u.email IS NOT NULL AND u.email <> '' ORDER BY pc.parent_id`,
    [learnerId], conn,
  );
}

async function findById(id, conn) {
  return db.one('SELECT * FROM users WHERE id = ?', [id], conn);
}

async function childIdsOf(parentId) {
  const rows = await db.query('SELECT learner_id FROM parent_children WHERE parent_id = ? ORDER BY learner_id', [parentId]);
  return rows.map((r) => r.learner_id);
}

async function parentIdsOf(learnerId, conn) {
  const rows = await db.query('SELECT parent_id FROM parent_children WHERE learner_id = ?', [learnerId], conn);
  return rows.map((r) => r.parent_id);
}

// "Thabo Mokoena" -> "Thabo M.", the way learners are listed on the teacher's class dashboard
function shortName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1][0] + '.' : parts[0] || '';
}

async function notify(userIds, { key = null, params = null, message = null }, conn) {
  for (const userId of userIds) {
    await db.query(
      'INSERT INTO notifications (user_id, msg_key, params, message) VALUES (?, ?, ?, ?)',
      [userId, key, params ? JSON.stringify(params) : null, message],
      conn,
    );
  }
}

module.exports = {
  bool, publicUser, findByEmail, findByIdNumber, findByLogin, parentsWithEmail, findById, childIdsOf, parentIdsOf, shortName, notify,
};
