// Password hashing, login tokens (JWT) and the middleware that guards each route.
// A token carries the user's token_version, so changing or resetting a password
// logs out every older session.
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError, unauthorized, forbidden, badRequest } = require('./http');

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores anything longer

// compared against when the email is unknown, so a login takes the same time either way
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const hashPassword = (password) => bcrypt.hash(password, 10);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash || DUMMY_HASH);

function checkNewPassword(value) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < MIN_PASSWORD_LENGTH) throw badRequest('pw_error_short', `Use at least ${MIN_PASSWORD_LENGTH} characters`, { n: MIN_PASSWORD_LENGTH });
  if (password.length > MAX_PASSWORD_LENGTH) throw badRequest('pw_error_long', `Use at most ${MAX_PASSWORD_LENGTH} characters`);
  return password;
}

// readable temporary password (no 0/O, 1/l/I look-alikes)
function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[crypto.randomInt(chars.length)]).join('');
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, tv: user.token_version }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Loads the logged-in user into req.user. Someone still on an administrator-issued
// temporary password may only reach the routes that opt in with allowPendingPassword.
function requireAuth({ allowPendingPassword = false } = {}) {
  return async (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('session_expired', 'Your session has expired, log in again');
    }
    const user = await db.one('SELECT * FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!user || user.token_version !== payload.tv) throw unauthorized('session_expired', 'Your session has expired, log in again');
    if (user.must_change_password && !allowPendingPassword) {
      throw new HttpError(403, 'password_change_required', 'Choose a new password before continuing');
    }
    req.user = user;
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

module.exports = {
  MIN_PASSWORD_LENGTH, hashPassword, verifyPassword, checkNewPassword, generateTempPassword,
  signToken, requireAuth, requireRole,
};
