// Outgoing email over SMTP (Gmail, Outlook/Microsoft 365, the school's own server, ...).
// Configure SMTP_* in .env. Without SMTP_HOST, emails are written to the server log instead,
// which is enough for local development.
const nodemailer = require('nodemailer');
const config = require('./config');

const transport = config.smtp.host
  ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })
  : null;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function send({ to, subject, text, html }) {
  if (!transport) {
    console.log(`[mail] SMTP is not configured; this email was not sent.\n  To: ${to}\n  Subject: ${subject}\n${text.replace(/^/gm, '  ')}`);
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text, html });
}

// checks the SMTP settings at startup so a wrong password shows up straight away
async function verify() {
  if (!transport) {
    console.warn('[mail] SMTP_HOST is not set: emails (like password resets) are written to this log instead of sent.');
    return;
  }
  try {
    await transport.verify();
    console.log(`[mail] Sending email through ${config.smtp.host}:${config.smtp.port} as ${config.smtp.from}`);
  } catch (err) {
    console.error(`[mail] Could not log in to ${config.smtp.host}:${config.smtp.port}: ${err.message}`);
  }
}

function sendPasswordReset(user, link, ttlMinutes) {
  const text = [
    `Hello ${user.name},`,
    '',
    'Someone asked to reset the password for your Smart Learning account.',
    `To choose a new password, open this link within ${ttlMinutes} minutes:`,
    '',
    link,
    '',
    'If you did not ask for this, you can ignore this email; your password stays the same.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(user.name)},</p>
<p>Someone asked to reset the password for your Smart Learning account.
To choose a new password, use this link within ${ttlMinutes} minutes:</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Reset my password</a></p>
<p style="font-size:12px;color:#555">Or paste this address into your browser:<br>${escapeHtml(link)}</p>
<p>If you did not ask for this, you can ignore this email; your password stays the same.</p>
<p>Smart Learning</p>`;
  return send({ to: user.email, subject: 'Reset your Smart Learning password', text, html });
}

// goes to the old address, so the owner hears about it even if someone else made the change
function sendEmailChanged(user, oldEmail, newEmail) {
  const text = [
    `Hello ${user.name},`,
    '',
    `The email address on your Smart Learning account was changed from ${oldEmail} to ${newEmail}.`,
    '',
    'If you did not do this, contact your school administrator straight away.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(user.name)},</p>
<p>The email address on your Smart Learning account was changed from ${escapeHtml(oldEmail)} to ${escapeHtml(newEmail)}.</p>
<p>If you did not do this, contact your school administrator straight away.</p>
<p>Smart Learning</p>`;
  return send({ to: oldEmail, subject: 'Your Smart Learning email address was changed', text, html });
}

module.exports = { send, verify, sendPasswordReset, sendEmailChanged };
