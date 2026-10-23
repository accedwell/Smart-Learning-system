// Account lockout, the emailed sign-in code for staff, and the security log.
//  - 5 wrong passwords (or sign-in codes) in a row lock an account for 15 minutes, and the
//    owner is emailed. A correct sign-in, a password reset or the administrator unlocks it.
//  - Administrators, principals and HODs confirm each sign-in with a 6-digit emailed code.
//    Asking again within its 10 minutes emails the same code, so any of those emails works.
//  - A sign-in from a device the account hasn't used before emails a login alert.
//  - Sign-ins, failures, lockouts and account changes go into security_events for the
//    administrator's Security page.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const mailer = require('./mailer');
const { parentsWithEmail } = require('./users');
const { HttpError } = require('./http');

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const TWO_FACTOR_ROLES = new Set(['admin', 'principal', 'hod']);
const KEEP_EVENTS_DAYS = 180;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---- the security log ----

// `user` is the account the event is about (when known); `login` what was typed to sign in;
// `actor` the person who did it, when that is someone else (an administrator)
async function logEvent(req, event, { user = null, login = null, actor = null } = {}) {
  try {
    await db.query(
      'INSERT INTO security_events (event, user_id, user_name, login, actor_id, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [event, user ? user.id : null, user ? user.name : null, login ? String(login).slice(0, 254) : null,
        actor ? actor.id : null, req ? String(req.ip || '').slice(0, 64) : null,
        req ? String(req.get('user-agent') || '').slice(0, 255) : null],
    );
  } catch (err) {
    // the log must never stop someone signing in
    console.error(`[security] could not log "${event}": ${err.message}`);
  }
}

function pruneEvents() {
  return db.query('DELETE FROM security_events WHERE created_at < UTC_TIMESTAMP() - INTERVAL ? DAY', [KEEP_EVENTS_DAYS]);
}

// ---- lockout ----

const isLocked = (user) => Boolean(user && user.locked_until && new Date(user.locked_until) > new Date());

function lockedError(user) {
  const minutes = Math.max(1, Math.ceil((new Date(user.locked_until) - Date.now()) / 60000));
  return new HttpError(423, 'login_error_locked', `Too many wrong attempts. This account is locked for ${minutes} more minutes`, { minutes });
}

// a wrong password or code for a known account; locks it (and emails the owner) on the 5th
// in a row. Throws the locked error when this attempt locked it.
async function failedAttempt(req, user, event, login) {
  await logEvent(req, event, { user, login });
  await db.query('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?', [user.id]);
  const { failed_logins: failed } = await db.one('SELECT failed_logins FROM users WHERE id = ?', [user.id]);
  if (failed < MAX_FAILED_LOGINS) return;
  await db.query('UPDATE users SET failed_logins = 0, locked_until = UTC_TIMESTAMP() + INTERVAL ? MINUTE WHERE id = ?', [LOCK_MINUTES, user.id]);
  await db.query('DELETE FROM login_codes WHERE user_id = ?', [user.id]);
  await logEvent(req, 'account_locked', { user });
  tellOwnerLocked(user);
  throw lockedError(await db.one('SELECT locked_until FROM users WHERE id = ?', [user.id]));
}

// after the reply has gone: to the account's email, or a learner's parents
async function tellOwnerLocked(user) {
  try {
    if (user.email) await mailer.sendAccountLocked(user, user.email, LOCK_MINUTES);
    else for (const parent of await parentsWithEmail(user.id)) await mailer.sendAccountLocked(user, parent.email, LOCK_MINUTES, parent);
  } catch (err) {
    console.error(`[security] could not email the lockout notice for account ${user.id}: ${err.message}`);
  }
}

function clearFailures(userId, conn) {
  return db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [userId], conn);
}

// ---- two-step sign-in ----

const needsCode = (user) => TWO_FACTOR_ROLES.has(user.role) && Boolean(user.email);

// "pi***@school.demo": enough for the person to recognise their address
function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return name.slice(0, 2) + '***@' + domain;
}

// the 6 digits for a code row: from its random seed and the server's secret, so the database
// alone doesn't give the code away and the same code can be emailed again
function codeFor(seed) {
  const mac = crypto.createHmac('sha256', config.jwtSecret).update('login-code:' + seed).digest();
  return String(mac.readUInt32BE(0) % 1000000).padStart(6, '0');
}

// The challenge goes to the browser, the code by email. While the account's code is still
// valid it stays the same (only the challenge is new), so an email that arrives late, or
// "send the code again", never leaves the person holding a code that no longer works.
async function startCodeSignIn(req, user) {
  const challenge = crypto.randomBytes(32).toString('hex');
  const { seed, minutes } = await db.tx(async (conn) => {
    const current = await db.one(
      `SELECT seed, CEIL(TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) / 60) AS minutes FROM login_codes
        WHERE user_id = ? AND expires_at > UTC_TIMESTAMP() + INTERVAL 1 MINUTE AND attempts < ? FOR UPDATE`,
      [user.id, MAX_CODE_ATTEMPTS], conn);
    if (current) {
      await db.query('UPDATE login_codes SET challenge_hash = ? WHERE user_id = ?', [sha256(challenge), user.id], conn);
      return { seed: current.seed, minutes: Number(current.minutes) };
    }
    const fresh = crypto.randomBytes(16).toString('hex');
    await db.query('DELETE FROM login_codes WHERE user_id = ?', [user.id], conn);
    await db.query(
      'INSERT INTO login_codes (user_id, challenge_hash, seed, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)',
      [user.id, sha256(challenge), fresh, CODE_MINUTES], conn,
    );
    return { seed: fresh, minutes: CODE_MINUTES };
  });
  try {
    await mailer.sendLoginCode(user, codeFor(seed), minutes);
  } catch (err) {
    console.error(`[security] could not email the sign-in code to account ${user.id}: ${err.message}`);
    throw new HttpError(502, 'email_failed', 'The email could not be sent');
  }
  await logEvent(req, 'code_sent', { user });
  return { twoFactor: true, challenge, email: maskEmail(user.email), minutes };
}

// the account a challenge + code belong to; throws when the code is wrong, expired or used up
async function finishCodeSignIn(req, challenge, code) {
  const row = typeof challenge === 'string' && challenge
    ? await db.one('SELECT * FROM login_codes WHERE challenge_hash = ? AND expires_at > UTC_TIMESTAMP()', [sha256(challenge)])
    : null;
  if (!row) throw new HttpError(400, 'two_factor_expired', 'This code has expired. Log in again to get a new one');
  const user = await db.one('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (isLocked(user)) throw lockedError(user);
  const given = Buffer.from(sha256(String(code || '').replace(/\s/g, '')));
  if (!crypto.timingSafeEqual(given, Buffer.from(sha256(codeFor(row.seed))))) {
    // a code may be tried a few times; then a new one is needed
    if (row.attempts + 1 >= MAX_CODE_ATTEMPTS) await db.query('DELETE FROM login_codes WHERE user_id = ?', [row.user_id]);
    else await db.query('UPDATE login_codes SET attempts = attempts + 1 WHERE user_id = ?', [row.user_id]);
    await failedAttempt(req, user, 'code_failed');
    throw new HttpError(400, 'two_factor_wrong', 'That code is wrong. Check the email and try again');
  }
  await db.query('DELETE FROM login_codes WHERE user_id = ?', [user.id]);
  return user;
}

// ---- login alerts ----

// "Chrome on Windows", "Phone app on Android"... from the user-agent text
function deviceName(ua) {
  ua = String(ua || '');
  const app = /Expo|okhttp|CFNetwork|Dalvik|SmartLearningApp/i.test(ua);
  const browser = app ? 'Phone app'
    : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'A browser or program';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS|Darwin/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

// The website and the phone app send a random id they keep for this device (X-Device-Id);
// without one, the browser's user agent stands in for it.
function deviceKey(req) {
  const id = String(req.get('x-device-id') || '');
  return sha256(/^[A-Za-z0-9-]{16,64}$/.test(id) ? 'id:' + id : 'ua:' + (req.get('user-agent') || ''));
}

// Every successful sign-in: logged, and when it comes from a device this account hasn't used
// before, the owner (a learner's parents) gets a login alert by email. An account's very first
// device gets no alert: that's the person setting it up.
async function signedIn(req, user) {
  await logEvent(req, 'login_ok', { user });
  try {
    const hash = deviceKey(req);
    const label = deviceName(req.get('user-agent')).slice(0, 80);
    const known = await db.one('SELECT 1 FROM known_devices WHERE user_id = ? AND device_hash = ?', [user.id, hash]);
    if (known) {
      await db.query('UPDATE known_devices SET last_seen = UTC_TIMESTAMP() WHERE user_id = ? AND device_hash = ?', [user.id, hash]);
      return;
    }
    const { n } = await db.one('SELECT COUNT(*) AS n FROM known_devices WHERE user_id = ?', [user.id]);
    await db.query('INSERT INTO known_devices (user_id, device_hash, label) VALUES (?, ?, ?)', [user.id, hash, label]);
    if (n === 0) return;
    await logEvent(req, 'new_device', { user });
    const alert = { device: label, ip: req.ip, time: new Date() };
    // after the reply: the person signing in shouldn't wait for the email
    setImmediate(async () => {
      try {
        if (user.email) await mailer.sendLoginAlert(user, user.email, alert);
        else for (const parent of await parentsWithEmail(user.id)) await mailer.sendLoginAlert(user, parent.email, alert, parent);
      } catch (err) {
        console.error(`[security] could not email the login alert for account ${user.id}: ${err.message}`);
      }
    });
  } catch (err) {
    console.error(`[security] could not check the device for account ${user.id}: ${err.message}`);
  }
}

module.exports = {
  MAX_FAILED_LOGINS, LOCK_MINUTES, logEvent, pruneEvents, isLocked, lockedError, failedAttempt, clearFailures,
  needsCode, startCodeSignIn, finishCodeSignIn, signedIn, deviceName,
};
