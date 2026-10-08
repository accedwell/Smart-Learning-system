// /api/auth: sign-up (learners, and the school's first administrator), login, the forced
// first-login password change, forgot/reset password, and the user's own profile.
const crypto = require('node:crypto');
const express = require('express');
const config = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { catalog } = require('../lib/catalog');
const { ensureLessons } = require('../lib/learners');
const { publicUser, findByEmail, childIdsOf } = require('../lib/users');
const { rateLimit } = require('../lib/rateLimit');
const mailer = require('../lib/mailer');
const http = require('../lib/http');

const router = express.Router();
const SELF_SIGNUP_ROLES = ['learner', 'admin'];
const RESET_TTL_MS = 60 * 60 * 1000;

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => req.ip + '|' + String(http.body(req).email || '').toLowerCase(),
});

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function session(user) {
  const out = publicUser(user);
  if (user.role === 'parent') out.childIds = await childIdsOf(user.id);
  return { token: auth.signToken(user), user: out, mustChangePassword: Boolean(user.must_change_password) };
}

router.post('/signup', credentialLimiter, async (req, res) => {
  const b = http.body(req);
  const role = http.oneOf(b.role, SELF_SIGNUP_ROLES, 'role');
  const name = http.text(b.name, 'name', { max: 100 });
  const email = http.email(b.email);
  const password = auth.checkNewPassword(b.password);
  const fields = { name, email, role, password_hash: await auth.hashPassword(password) };
  if (role === 'learner') {
    fields.grade = http.oneOf(String(b.grade), catalog.GRADES, 'grade');
    fields.id_number = http.text(b.idNumber, 'idNumber', { max: 30 });
  }

  const user = await db.tx(async (conn) => {
    if (role === 'admin' && !config.allowAdminSignup) {
      const existing = await db.one("SELECT id FROM users WHERE role = 'admin' LIMIT 1 FOR UPDATE", [], conn);
      if (existing) throw http.forbidden('signup_error_admin_closed', 'This school already has an administrator; ask them to add you');
    }
    if (await findByEmail(email, conn)) throw http.conflict('signup_error_email_taken', 'An account with this email already exists');
    const result = await db.query('INSERT INTO users SET ?', [fields], conn);
    if (role === 'learner') await ensureLessons(result.insertId, conn);
    return db.one('SELECT * FROM users WHERE id = ?', [result.insertId], conn);
  });
  res.status(201).json(await session(user));
});

// `role` is optional; when sent it must match the account, as on the login screen
router.post('/login', credentialLimiter, async (req, res) => {
  const b = http.body(req);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const user = email ? await findByEmail(email) : null;
  const ok = await auth.verifyPassword(password, user && user.password_hash);
  if (!user || !ok) throw http.unauthorized('login_error_password', 'Wrong email or password');
  if (b.role && b.role !== user.role) {
    throw http.forbidden('login_error_role', `This account is a ${user.role} account`, { role: user.role });
  }
  res.json(await session(user));
});

// required on first login with a temporary password (no current password needed then)
router.post('/change-password', auth.requireAuth({ allowPendingPassword: true }), async (req, res) => {
  const b = http.body(req);
  const user = req.user;
  if (!user.must_change_password) {
    const current = typeof b.currentPassword === 'string' ? b.currentPassword : '';
    if (!(await auth.verifyPassword(current, user.password_hash))) throw http.badRequest('pw_error_current', 'Your current password is wrong');
  }
  const next = auth.checkNewPassword(b.newPassword);
  if (await auth.verifyPassword(next, user.password_hash)) throw http.badRequest('pw_error_same', 'Choose a password you have not used here');
  await db.query(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
    [await auth.hashPassword(next), user.id],
  );
  res.json(await session(await db.one('SELECT * FROM users WHERE id = ?', [user.id])));
});

// Emails a one-hour reset link. Always answers the same way, and sends the email after
// answering, so neither the reply nor its timing tells anyone who has an account.
router.post('/forgot-password', credentialLimiter, async (req, res) => {
  const b = http.body(req);
  const user = typeof b.email === 'string' ? await findByEmail(b.email) : null;
  res.json({ ok: true });
  if (!user) return;
  const token = crypto.randomBytes(32).toString('hex');
  try {
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    await db.query('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [sha256(token), user.id, new Date(Date.now() + RESET_TTL_MS)]);
    const link = `${config.appUrl}/?reset=${token}`;
    await mailer.sendPasswordReset(user, link, RESET_TTL_MS / 60000);
  } catch (err) {
    console.error(`[auth] could not send the password reset email to ${user.email}: ${err.message}`);
  }
});

router.post('/reset-password', credentialLimiter, async (req, res) => {
  const b = http.body(req);
  const token = typeof b.token === 'string' ? b.token : '';
  const reset = token && await db.one('SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [sha256(token)]);
  if (!reset) throw http.badRequest('reset_link_invalid', 'This reset link is invalid or has expired');
  const next = auth.checkNewPassword(b.newPassword);
  await db.tx(async (conn) => {
    await db.query(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
      [await auth.hashPassword(next), reset.user_id], conn,
    );
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [reset.user_id], conn);
  });
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth({ allowPendingPassword: true }), async (req, res) => {
  const out = publicUser(req.user);
  if (req.user.role === 'parent') out.childIds = await childIdsOf(req.user.id);
  res.json({ user: out });
});

// a person may edit their own contact details; school details are the administrator's job
router.patch('/me', auth.requireAuth(), async (req, res) => {
  const b = http.body(req);
  const updates = {};
  if ('name' in b) updates.name = http.text(b.name, 'name', { max: 100 });
  if ('phone' in b) updates.phone = http.text(b.phone, 'phone', { max: 30, required: false }) || null;
  if ('email' in b) {
    updates.email = http.email(b.email);
    const other = await findByEmail(updates.email);
    if (other && other.id !== req.user.id) throw http.conflict('admin_error_email_taken', 'Another account already uses this email');
  }
  if (Object.keys(updates).length) await db.query('UPDATE users SET ? WHERE id = ?', [updates, req.user.id]);
  res.json({ user: publicUser(await db.one('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

module.exports = router;
