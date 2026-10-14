// Claude, for the AI features the prototype ran through its artifact runtime: one-line
// recommendations and turning a question paper into a quiz. (The support chat runs in the
// Python chatbot, smart_learning/chatbot.)
// Credentials come from ANTHROPIC_API_KEY (or an `ant auth login` profile). If there are
// none, or AI_ENABLED=false, the routes answer 503 `ai_unavailable` and the UI carries on without AI.
const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const { HttpError } = require('./http');

let client = null;
function getClient() {
  if (!config.ai.enabled) throw unavailable();
  if (!client) client = new Anthropic();
  return client;
}

function unavailable() {
  return new HttpError(503, 'ai_unavailable', 'The AI assistant is not available right now');
}

// shared request settings: on a safety decline the API retries on Anthropic's recommended fallback model
function baseParams({ maxTokens, effort, system }) {
  return {
    model: config.ai.model,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
    ...(system ? { system } : {}),
  };
}

function textOf(message) {
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'ai_refused', 'The AI assistant could not help with that');
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// maps SDK failures onto API errors; missing credentials or a bad key reads as "AI unavailable"
function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return unavailable();
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'ai_busy', 'The AI assistant is busy, try again shortly');
  if (err instanceof Anthropic.APIError && err.status == null) return unavailable(); // connection failure
  if (err instanceof Anthropic.APIError) return new HttpError(502, 'upstream_error', 'The AI assistant had a problem, try again');
  // the client throws a plain Error when it cannot find any credentials
  if (err instanceof Error && /api key|auth/i.test(err.message)) return unavailable();
  return err;
}

async function create(params) {
  try {
    return await getClient().beta.messages.create(params);
  } catch (err) {
    throw toHttpError(err);
  }
}

// ONE short sentence back, as the dashboards' suggestion buttons expect
async function askOneLiner(prompt) {
  const message = await create({
    ...baseParams({ maxTokens: 4000, effort: 'low' }),
    messages: [{ role: 'user', content: prompt }],
  });
  return textOf(message);
}

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, answer: { type: 'string' } },
        required: ['text', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

// reads a question paper or study guide and drafts up to `max` short-answer questions: from the
// file itself (image or PDF, `fileBase64` + `mimeType`), or from its text (`text`, e.g. a Word file's)
async function quizFromPaper({ fileBase64, mimeType, text, prompt, max = 6 }) {
  let docBlock;
  if (text != null) {
    docBlock = { type: 'text', text: `<document>\n${text}\n</document>` };
  } else {
    const source = { type: 'base64', media_type: mimeType, data: fileBase64 };
    docBlock = mimeType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
  }
  const message = await create({
    ...baseParams({ maxTokens: 16000, effort: 'medium' }),
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: QUIZ_SCHEMA } },
    messages: [{ role: 'user', content: [docBlock, { type: 'text', text: prompt }] }],
  });
  let data;
  try {
    data = JSON.parse(textOf(message));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'invalid_json', 'The AI reply could not be read');
  }
  return (Array.isArray(data.questions) ? data.questions : [])
    .map((q) => ({ text: String(q.text || '').trim(), answer: String(q.answer || '').trim() }))
    .filter((q) => q.text && q.answer)
    .slice(0, max);
}

module.exports = { askOneLiner, quizFromPaper };
