// Routes every role shares: the public catalog, notifications, question-paper downloads
// and the AI support chat.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const config = require('../lib/config');
const { aiLimiter } = require('../lib/rateLimit');
const { catalog } = require('../lib/catalog');
const { childIdsOf } = require('../lib/users');
const { filePath } = require('../lib/uploads');
const { sentToLearners } = require('../lib/classes');
const http = require('../lib/http');

const router = express.Router();

router.get('/health', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true });
});

// everything the dashboards need to render choices; the check-in quiz is sent without its answers
router.get('/catalog', (req, res) => {
  res.json({
    roles: catalog.ROLES,
    grades: catalog.GRADES,
    subjectGroups: catalog.SUBJECT_GROUPS,
    departments: catalog.DEPARTMENTS,
    languages: catalog.LANGUAGES,
    assessments: catalog.ASSESSMENTS_BANK,
    checkinQuiz: catalog.QUIZ_BANK.map(({ qKey, optKeys }) => ({ qKey, optKeys })),
    minPasswordLength: auth.MIN_PASSWORD_LENGTH,
  });
});

// ---- notifications ----

function notificationView(n) {
  return { id: n.id, key: n.msg_key, params: n.params, message: n.message, read: Boolean(n.is_read), createdAt: n.created_at };
}

router.get('/notifications', auth.requireAuth(), async (req, res) => {
  const rows = await db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [req.user.id]);
  res.json({ notifications: rows.map(notificationView), unread: rows.filter((n) => !n.is_read).length });
});

router.post('/notifications/read-all', auth.requireAuth(), async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

router.post('/notifications/:id/read', auth.requireAuth(), async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [http.id(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ---- question-paper files ----

// learners get their own grade's papers, parents their children's grades, staff every paper
// Learners get the papers sent to their classes, parents their children's, teachers their
// own and those sent to classes they teach; HODs, principals and administrators every paper.
async function canReadPaper(user, paper) {
  if (user.role === 'learner' || user.role === 'parent') {
    const learnerIds = user.role === 'learner' ? [user.id] : await childIdsOf(user.id);
    if (learnerIds.length === 0) return false;
    return Boolean(await db.one(`SELECT 1 FROM papers p WHERE p.id = ? AND ${sentToLearners('paper', 'p')}`, [paper.id, learnerIds]));
  }
  if (user.role === 'teacher') {
    if (paper.teacher_id === user.id) return true;
    return Boolean(await db.one(
      'SELECT 1 FROM paper_classes pc JOIN classes k ON k.id = pc.class_id WHERE pc.paper_id = ? AND k.teacher_id = ? LIMIT 1',
      [paper.id, user.id],
    ));
  }
  return true;
}

// ?download=1 saves the file instead of showing it in the browser
router.get('/papers/:id/file', auth.requireAuth(), async (req, res) => {
  const paper = await db.one('SELECT * FROM papers WHERE id = ?', [http.id(req.params.id)]);
  if (!paper || !(await canReadPaper(req.user, paper))) throw http.notFound('paper_not_found', 'No such question paper');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(paper.mime_type);
  res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(paper.file_name)}`);
  res.sendFile(filePath(paper.stored_name));
});

// ---- AI support chat ----
//
// The chat itself runs in the Python chatbot service (smart_learning/chatbot). This backend checks
// who is logged in, rate-limits and checks the messages, then forwards the chat there with the
// shared CHATBOT_SECRET and passes its streamed reply straight through.

function chatMessages(value) {
  const messages = Array.isArray(value) ? value.slice(-20) : [];
  const valid = messages.length > 0 && messages.every((m, i) =>
    m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() &&
    m.content.length <= 4000 && (i === 0 || m.role !== messages[i - 1].role));
  if (!valid || messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    throw http.badRequest('invalid_field', 'messages must alternate user/assistant turns, starting and ending with the user', { field: 'messages' });
  }
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

// Opens the chat with the Python service; its errors (AI not set up, busy…) come back as
// HttpErrors, and an unreachable service as 503 chatbot_offline.
async function askChatbot(payload, signal) {
  let upstream;
  try {
    upstream = await fetch(`${config.chatbot.url}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chatbot-Secret': config.chatbot.secret },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (signal && signal.aborted) throw err;
    throw new http.HttpError(503, 'chatbot_offline', 'The chat assistant is not running right now');
  }
  if (!upstream.ok) {
    const data = await upstream.json().catch(() => null);
    const e = data && data.error;
    if (upstream.status === 403) console.error('[ai/chat] the chatbot refused the secret: check CHATBOT_SECRET in backend/.env');
    throw new http.HttpError(e ? upstream.status : 502, (e && e.code) || 'upstream_error', (e && e.message) || 'The chat assistant had a problem, try again');
  }
  return upstream;
}

// Body: { messages: [{ role, content }], lang } where lang is a language value from the
// catalog, or omitted to answer in the language the person writes in. Send
// `Accept: text/event-stream` to stream the reply as `text` events, then one `done` event
// (or an `error` event); otherwise the answer is { reply }.
router.post('/ai/chat', auth.requireAuth(), aiLimiter, async (req, res) => {
  const b = http.body(req);
  const known = catalog.LANGUAGES.find((l) => l.value === b.lang);
  const payload = {
    messages: chatMessages(b.messages),
    reply_language: known && known.value !== 'English' ? known.label : 'the same language the user writes in',
    user_name: req.user.name,
    user_role: req.user.role,
  };
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  // asked before anything is sent, so a failure here is still a normal error answer
  const upstream = await askChatbot(payload, abort.signal);

  if ((req.get('accept') || '').includes('text/event-stream')) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    try {
      for await (const chunk of upstream.body) res.write(chunk);
    } catch (err) {
      if (!abort.signal.aborted) console.error('[ai/chat] stream from the chatbot broke:', err.message);
    }
    return res.end();
  }

  // no streaming wanted: wait for the whole reply
  const text = await upstream.text();
  const event = (name) => {
    const m = text.match(new RegExp(`event: ${name}\\ndata: (.*)\\n`));
    return m ? JSON.parse(m[1]) : null;
  };
  const failed = event('error');
  if (failed) throw new http.HttpError(502, failed.code, failed.message);
  res.json({ reply: (event('done') || {}).reply || '' });
});

module.exports = router;
