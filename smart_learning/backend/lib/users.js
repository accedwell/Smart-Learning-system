// Turning user rows into API objects, plus lookups several routers need.
const db = require('./db');

const bool = (v) => (v == null ? null : Boolean(v));

// the fields any logged-in user may see about an account (never the password hash)
function publicUser(u) {
  const out = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    mustChangePassword: Boolean(u.must_change_password),
    createdAt: u.created_at,
  };
  if (u.role === 'learner') Object.assign(out, { grade: u.grade, idNumber: u.id_number || '', progress: u.progress });
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

module.exports = { bool, publicUser, findByEmail, findById, childIdsOf, parentIdsOf, shortName, notify };
