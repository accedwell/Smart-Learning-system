// Error type and request validators shared by every router. Error codes reuse the
// frontend's i18n keys where one exists, so the UI can show `t(error.code, error.vars)`.
class HttpError extends Error {
  constructor(status, code, message, vars) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.vars = vars;
  }
}

const badRequest = (code, message, vars) => new HttpError(400, code, message, vars);
const unauthorized = (code = 'unauthorized', message = 'Log in to continue') => new HttpError(401, code, message);
const forbidden = (code = 'forbidden', message = 'You do not have access to this', vars) => new HttpError(403, code, message, vars);
const notFound = (code = 'not_found', message = 'Not found') => new HttpError(404, code, message);
const conflict = (code, message, vars) => new HttpError(409, code, message, vars);

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function id(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('invalid_field', `${field} must be a positive whole number`, { field });
  return n;
}

// trimmed string; '' when missing and optional
function text(value, field, { max = 200, required = true } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s && required) throw badRequest('invalid_field', `${field} is required`, { field });
  if (s.length > max) throw badRequest('invalid_field', `${field} must be at most ${max} characters`, { field });
  return s;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw badRequest('invalid_field', `${field} must be one of: ${allowed.join(', ')}`, { field });
  return value;
}

function int(value, field, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest('invalid_field', `${field} must be a whole number from ${min} to ${max}`, { field });
  return n;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function email(value) {
  const s = text(value, 'email', { max: 254 }).toLowerCase();
  if (!isValidEmail(s)) throw badRequest('admin_error_email', 'Enter a valid email address');
  return s;
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, body, id, text, oneOf, int, email };
