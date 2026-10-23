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

// The demo accounts' @school.demo addresses have no inbox. While the demo school is on, their
// emails (like sign-in codes) go to the school's own sending mailbox instead, marked with the
// account they were for, so the demo can be shown with real emails.
const DEMO_DOMAIN = '@school.demo';

async function send({ to, subject, text, html }) {
  if (config.seedDemoData && config.smtp.user && String(to).toLowerCase().endsWith(DEMO_DOMAIN)) {
    subject = `[Demo: ${to}] ${subject}`;
    to = config.smtp.user;
  }
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

// a new (or reset) account's login details, sent when the administrator presses "Send email"
function sendLoginDetails(user, tempPassword, loginUrl) {
  const text = [
    `Hello ${user.name},`,
    '',
    'Your school has created a Smart Learning account for you. Your login details:',
    '',
    `  Email: ${user.email}`,
    `  Temporary password: ${tempPassword}`,
    '',
    `Log in at ${loginUrl} (or in the Smart Learning app). The first time you log in, you will`,
    'choose your own password.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(user.name)},</p>
<p>Your school has created a Smart Learning account for you. Your login details:</p>
<table style="border-collapse:collapse;margin:8px 0 14px">
<tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td style="padding:4px 0"><b>${escapeHtml(user.email)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Temporary password</td><td style="padding:4px 0;font-family:monospace;font-size:16px"><b>${escapeHtml(tempPassword)}</b></td></tr>
</table>
<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 18px;background:#b8791f;color:#fff;border-radius:6px;text-decoration:none">Log in to Smart Learning</a></p>
<p>You can also log in in the Smart Learning app. The first time you log in, you will choose your own password.</p>
<p>Smart Learning</p>`;
  return send({ to: user.email, subject: 'Your Smart Learning login details', text, html });
}

// A learner's login details (they log in with their ID number), sent to their parent's email,
// together with the parent's own login when the parent's account is new too.
function sendFamilyLoginDetails(parent, learner, learnerPassword, parentPassword, loginUrl) {
  const text = [
    `Hello ${parent.name},`,
    '',
    `The school has created a Smart Learning account for ${learner.name}${parentPassword ? ', and one for you as their parent' : ''}.`,
    '',
    `${learner.name}'s login (learner):`,
    `  ID number: ${learner.id_number}`,
    `  Temporary password: ${learnerPassword}`,
    ...(parentPassword ? ['', 'Your login (parent):', `  Email: ${parent.email}`, `  Temporary password: ${parentPassword}`] : []),
    '',
    `Log in at ${loginUrl} (or in the Smart Learning app). The first time each of you logs in,`,
    'you will choose your own password.',
    '',
    'Smart Learning',
  ].join('\n');
  const row = (label, value, mono) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555">${label}</td><td style="padding:4px 0${mono ? ';font-family:monospace;font-size:16px' : ''}"><b>${escapeHtml(value)}</b></td></tr>`;
  const html = `<p>Hello ${escapeHtml(parent.name)},</p>
<p>The school has created a Smart Learning account for <b>${escapeHtml(learner.name)}</b>${parentPassword ? ', and one for you as their parent' : ''}.</p>
<p style="margin-bottom:2px"><b>${escapeHtml(learner.name)}'s login (learner)</b></p>
<table style="border-collapse:collapse;margin:4px 0 14px">${row('ID number', learner.id_number)}${row('Temporary password', learnerPassword, true)}</table>
${parentPassword ? `<p style="margin-bottom:2px"><b>Your login (parent)</b></p>
<table style="border-collapse:collapse;margin:4px 0 14px">${row('Email', parent.email)}${row('Temporary password', parentPassword, true)}</table>` : ''}
<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 18px;background:#b8791f;color:#fff;border-radius:6px;text-decoration:none">Log in to Smart Learning</a></p>
<p>You can also log in in the Smart Learning app. The first time each of you logs in, you will choose your own password.</p>
<p>Smart Learning</p>`;
  return send({ to: parent.email, subject: `Smart Learning login details for ${learner.name}`, text, html });
}

// a learner asked to reset their password: the link goes to their parent
function sendLearnerPasswordReset(parent, learner, link, ttlMinutes) {
  const text = [
    `Hello ${parent.name},`,
    '',
    `Someone asked to reset the password for ${learner.name}'s Smart Learning account (ID number ${learner.id_number}).`,
    `To choose a new password for them, open this link within ${ttlMinutes} minutes:`,
    '',
    link,
    '',
    'If nobody asked for this, you can ignore this email; the password stays the same.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(parent.name)},</p>
<p>Someone asked to reset the password for <b>${escapeHtml(learner.name)}</b>'s Smart Learning account (ID number ${escapeHtml(learner.id_number)}).
To choose a new password for them, use this link within ${ttlMinutes} minutes:</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#b8791f;color:#fff;border-radius:6px;text-decoration:none">Reset ${escapeHtml(learner.name)}'s password</a></p>
<p style="font-size:12px;color:#555">Or paste this address into your browser:<br>${escapeHtml(link)}</p>
<p>If nobody asked for this, you can ignore this email; the password stays the same.</p>
<p>Smart Learning</p>`;
  return send({ to: parent.email, subject: `Reset ${learner.name}'s Smart Learning password`, text, html });
}

// the 6-digit code that finishes a staff member's sign-in
function sendLoginCode(user, code, ttlMinutes) {
  const text = [
    `Hello ${user.name},`,
    '',
    `Your Smart Learning sign-in code is: ${code}`,
    '',
    `It works once, for ${ttlMinutes} minutes.`,
    'If you did not just try to sign in, someone knows your password: reset it straight away.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(user.name)},</p>
<p>Your Smart Learning sign-in code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${escapeHtml(code)}</p>
<p>It works once, for ${ttlMinutes} minutes.</p>
<p>If you did not just try to sign in, someone knows your password: reset it straight away.</p>
<p>Smart Learning</p>`;
  return send({ to: user.email, subject: `Smart Learning sign-in code: ${code}`, text, html });
}

// after too many wrong passwords; to the account's own email, or to a learner's parent
function sendAccountLocked(user, to, minutes, parent = null) {
  const whose = parent ? `${user.name}'s Smart Learning account` : 'your Smart Learning account';
  const text = [
    `Hello ${parent ? parent.name : user.name},`,
    '',
    `Someone entered a wrong password for ${whose} too many times, so it is locked for ${minutes} minutes.`,
    '',
    'If this was you, wait and try again, or use "Forgot password?" on the login page.',
    'If it was not you, someone may be trying to get in: reset the password once the lock ends, or ask the school administrator.',
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(parent ? parent.name : user.name)},</p>
<p>Someone entered a wrong password for ${escapeHtml(whose)} too many times, so it is <b>locked for ${minutes} minutes</b>.</p>
<p>If this was you, wait and try again, or use "Forgot password?" on the login page.</p>
<p>If it was not you, someone may be trying to get in: reset the password once the lock ends, or ask the school administrator.</p>
<p>Smart Learning</p>`;
  return send({ to, subject: 'Smart Learning account locked', text, html });
}

// a sign-in from a device the account hasn't used before; to the account's own email, or to a
// learner's parent
function sendLoginAlert(user, to, { device, ip, time }, parent = null) {
  const when = time.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const whose = parent ? `${user.name}'s Smart Learning account` : 'your Smart Learning account';
  const text = [
    `Hello ${parent ? parent.name : user.name},`,
    '',
    `Someone just signed in to ${whose} from a new device:`,
    '',
    `  When:   ${when}`,
    `  Device: ${device}`,
    `  IP:     ${ip}`,
    '',
    'If this was you, there is nothing to do.',
    `If it was not you, change the password straight away with "Forgot password?" at ${config.appUrl}, and tell the school administrator.`,
    '',
    'Smart Learning',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(parent ? parent.name : user.name)},</p>
<p>Someone just signed in to ${escapeHtml(whose)} from a <b>new device</b>:</p>
<table style="border-collapse:collapse;font-size:14px">
<tr><td style="padding:2px 12px 2px 0;color:#555">When</td><td>${escapeHtml(when)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#555">Device</td><td>${escapeHtml(device)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#555">IP address</td><td>${escapeHtml(ip)}</td></tr>
</table>
<p>If this was you, there is nothing to do.</p>
<p>If it was <b>not</b> you, change the password straight away with "Forgot password?" on the <a href="${escapeHtml(config.appUrl)}">login page</a>, and tell the school administrator.</p>
<p>Smart Learning</p>`;
  return send({ to, subject: 'New sign-in to Smart Learning', text, html });
}

// whether emails really go out (SMTP set up) or are only written to the log
const configured = () => Boolean(transport);

module.exports = {
  send, verify, sendPasswordReset, sendEmailChanged, sendLoginDetails, sendFamilyLoginDetails, sendLearnerPasswordReset,
  sendLoginCode, sendAccountLocked, sendLoginAlert, configured,
};
