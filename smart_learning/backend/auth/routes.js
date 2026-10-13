// /api/auth: login, the forced first-login password change, forgot/reset password, and the
// user's own profile. Nobody signs up: the school administrator creates every account, and
// the first administrator comes from `npm run create-admin`.
const crypto = require('node:crypto');
const express = require('express');
const config = require('../lib/config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { publicUser, findByEmail, childIdsOf } = require('../lib/users');
const { rateLimit, failureLimit } = require('../lib/rateLimit');
const mailer = require('../lib/mailer');
const http = require('../lib/http');

const router = express.Router();
const RESET_TTL_MS = 60 * 60 * 1000;
// at most one reset email per account this often, however many times it is asked for
const RESET_EMAIL_GAP_MS = 5 * 60 * 1000;
const GUESS_WINDOW_MS = 15 * 60 * 1000;

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => req.ip + '|' + String(http.body(req).email || '').toLowerCase(),
});

// Wrong passwords, counted per account and per IP address separately. The account limit
// stops many addresses guessing one account's password; the address limit stops one address
// trying a few common passwords on every account, and is higher because a whole school can
// share one address.
const accountGuesses = failureLimit({ windowMs: GUESS_WINDOW_MS, max: 10 });
const addressGuesses = failureLimit({ windowMs: GUESS_WINDOW_MS, max: 100 });

function checkGuesses(req, res, email) {
  addressGuesses.check(res, req.ip);
  accountGuesses.check(res, email);
}

function wrongGuess(req, email) {
  addressGuesses.fail(req.ip);
  accountGuesses.fail(email);
}

// for changes a stolen session must not be able to make on its own
async function requireCurrentPassword(req, res) {
  checkGuesses(req, res, req.user.email);
  const current = http.body(req).currentPassword;
  if (!(await auth.verifyPassword(typeof current === 'string' ? current : '', req.user.password_hash))) {
    wrongGuess(req, req.user.email);
    throw http.badRequest('pw_error_current', 'Your current password is wrong');
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function session(user) {
  const out = publicUser(user);
  if (user.role === 'parent') out.childIds = await childIdsOf(user.id);
  return { token: auth.signToken(user), user: out, mustChangePassword: Boolean(user.must_change_password) };
}

// `role` is optional; when sent it must match the account, as on the login screen
router.post('/login', credentialLimiter, async (req, res) => {
  const b = http.body(req);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  checkGuesses(req, res, email);
  const user = email ? await findByEmail(email) : null;
  const ok = await auth.verifyPassword(password, user && user.password_hash);
  if (!user || !ok) {
    wrongGuess(req, email);
    throw http.unauthorized('login_error_password', 'Wrong email or password');
  }
  if (b.role && b.role !== user.role) {
    throw http.forbidden('login_error_role', `This account is a ${user.role} account`, { role: user.role });
  }
  res.json(await session(user));
});

// required on first login with a temporary password (no current password needed then)
router.post('/change-password', auth.requireAuth({ allowPendingPassword: true }), async (req, res) => {
  const b = http.body(req);
  const user = req.user;
  if (!user.must_change_password) await requireCurrentPassword(req, res);
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
  try {
    const token = crypto.randomBytes(32).toString('hex');
    // the account's row lock lets one request at a time through, so a burst of them can't
    // all pass the check before any has saved its link
    const created = await db.tx(async (conn) => {
      await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id], conn);
      // a link sent in the last few minutes is still in their inbox
      const recent = await db.one('SELECT 1 FROM password_resets WHERE user_id = ? AND expires_at > ?',
        [user.id, new Date(Date.now() + RESET_TTL_MS - RESET_EMAIL_GAP_MS)], conn);
      if (recent) return false;
      await db.query('DELETE FROM password_resets WHERE user_id = ?', [user.id], conn);
      await db.query('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        [sha256(token), user.id, new Date(Date.now() + RESET_TTL_MS)], conn);
      return true;
    });
    if (!created) return;
    // after the #, which browsers never send to a server or put in a Referer header
    const link = `${config.appUrl}/#reset=${token}`;
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

// A person may edit their own contact details; school details are the administrator's job.
// A new email needs `currentPassword` too, and the old address is told about the change.
router.patch('/me', auth.requireAuth(), async (req, res) => {
  const b = http.body(req);
  const user = req.user;
  const updates = {};
  if ('name' in b) updates.name = http.text(b.name, 'name', { max: 100 });
  if ('phone' in b) updates.phone = http.text(b.phone, 'phone', { max: 30, required: false }) || null;
  if ('email' in b) {
    const email = http.email(b.email);
    if (email !== user.email) {
      await requireCurrentPassword(req, res);
      if (await findByEmail(email)) throw http.conflict('admin_error_email_taken', 'Another account already uses this email');
      updates.email = email;
    }
  }
  if (Object.keys(updates).length) await db.query('UPDATE users SET ? WHERE id = ?', [updates, user.id]);
  res.json({ user: publicUser(await db.one('SELECT * FROM users WHERE id = ?', [user.id])) });
  if (!updates.email) return;
  try {
    await mailer.sendEmailChanged(user, user.email, updates.email);
  } catch (err) {
    console.error(`[auth] could not tell ${user.email} about the email change: ${err.message}`);
  }
});

module.exports = router;
