// Routes every role shares: the public catalog, notifications, question-paper downloads
// and the AI support chat.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const ai = require('../lib/ai');
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

const LANGUAGE_LIST = "South Africa's official languages (English, Afrikaans, isiZulu, isiXhosa, isiNdebele, Sepedi, Sesotho, Setswana, siSwati, Tshivenda, Xitsonga)";

function chatSystem(replyLanguage) {
  return 'You are the Smart Learning support assistant, helping learners, teachers, parents and school staff. ' +
    `You understand and can translate to and from ${LANGUAGE_LIST}. ` +
    `Always reply in ${replyLanguage} — this is the person's own chosen language for this chat, chosen independently of the ` +
    'rest of the app, so use it regardless of what language they type in, translating their message naturally. ' +
    'If they explicitly paste text and ask you to translate it into a different one-off South African language, do that ' +
    `translation in your answer, but still write the rest of your reply (any explanation) in ${replyLanguage}. ` +
    'Keep replies concise (2-4 sentences unless a longer translation is requested) and friendly.';
}

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

// Body: { messages: [{ role, content }], lang } where lang is a language value from the
// catalog, or omitted to answer in the language the person writes in. Send
// `Accept: text/event-stream` to stream the reply as `text` events, then one `done` event.
router.post('/ai/chat', auth.requireAuth(), aiLimiter, async (req, res) => {
  const b = http.body(req);
  const messages = chatMessages(b.messages);
  const known = catalog.LANGUAGES.find((l) => l.value === b.lang);
  const system = chatSystem(known && known.value !== 'English' ? known.label : 'the same language the user writes in');

  if (!(req.get('accept') || '').includes('text/event-stream')) {
    return res.json({ reply: await ai.chat({ system, messages }) });
  }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    const reply = await ai.chat({ system, messages, signal: abort.signal, onText: (text) => send('text', { text }) });
    send('done', { reply });
  } catch (err) {
    if (!abort.signal.aborted) {
      const known = err instanceof http.HttpError;
      if (!known) console.error('[ai/chat]', err);
      send('error', { code: known ? err.code : 'server_error', message: known ? err.message : 'Something went wrong' });
    }
  }
  res.end();
});

module.exports = router;
