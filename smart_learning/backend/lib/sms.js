// Text messages through textbee (https://textbee.dev): an Android phone running the textbee app
// sends them, so they use that phone's airtime. Configure TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID
// in .env. Without them, messages are written to the server log instead, like email.
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./http');

const SMS_MAX = 480; // three SMS parts at most
const TIMEOUT_MS = 15000;

const configured = () => Boolean(config.sms.apiKey && config.sms.deviceId);

// A phone number in international form (+27821234567), or null if it can't be one.
// Local numbers (0821234567) get the school's country code.
function normalizeNumber(raw) {
  if (typeof raw !== 'string') return null;
  let n = raw.trim().replace(/[\s()-]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('0')) n = '+' + config.sms.countryCode + n.slice(1);
  if (!n.startsWith('+')) n = '+' + n;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

// Sends `message` to the numbers; throws an HttpError if textbee refuses or can't be reached.
async function send(numbers, message) {
  const recipients = [...new Set(numbers.map(normalizeNumber).filter(Boolean))];
  if (recipients.length === 0) return { sent: 0 };
  const text = String(message).slice(0, SMS_MAX);
  if (!configured()) {
    console.log(`[sms] textbee is not configured; this SMS was not sent.\n  To: ${recipients.join(', ')}\n  ${text}`);
    return { sent: 0, logged: recipients.length };
  }
  let res;
  try {
    res = await fetch(`${config.sms.apiUrl}/gateway/devices/${encodeURIComponent(config.sms.deviceId)}/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.sms.apiKey },
      body: JSON.stringify({ recipients, message: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(502, 'sms_failed', `Could not reach textbee: ${err.message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(502, 'sms_failed', `textbee refused the SMS (HTTP ${res.status}) ${detail.slice(0, 200)}`);
  }
  return { sent: recipients.length };
}

// For automatic messages (alerts, reminders): never fails the request that caused them.
async function sendQuietly(numbers, message) {
  try {
    return await send(numbers, message);
  } catch (err) {
    console.error(`[sms] ${err.message}`);
    return { sent: 0, error: err.message };
  }
}

// the phone numbers on file for these users
async function phonesOf(userIds) {
  if (!userIds.length) return [];
  const rows = await db.query('SELECT phone FROM users WHERE id IN (?) AND phone IS NOT NULL AND phone <> ""', [userIds]);
  return rows.map((r) => r.phone);
}

function status() {
  return { configured: configured(), countryCode: config.sms.countryCode };
}

module.exports = { normalizeNumber, send, sendQuietly, phonesOf, status, SMS_MAX };
