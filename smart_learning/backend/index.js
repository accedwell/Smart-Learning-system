// Smart Learning API. Start with `npm run dev`; settings are in .env (see .env.example).
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const config = require('./lib/config');
const db = require('./lib/db');
const { ensureLessonCatalog, seedDemoData, DEMO_PASSWORD } = require('./lib/seed');
const { HttpError } = require('./lib/http');
const mailer = require('./lib/mailer');

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./auth/routes'));
app.use('/api/admin', require('./admin/routes'));
app.use('/api/teacher', require('./teacher/routes'));
app.use('/api/learner', require('./learner/routes'));
app.use('/api/parent', require('./parent/routes'));
app.use('/api/hod', require('./hod/routes'));
app.use('/api/principal', require('./principal/routes'));
app.use('/api', require('./common/routes'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` } });
});

// every error leaves as { error: { code, message, vars? } }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let e = err;
  if (err instanceof multer.MulterError) {
    e = err.code === 'LIMIT_FILE_SIZE'
      ? new HttpError(413, 'paper_too_big', `The file is larger than ${config.maxUploadBytes / 1024 / 1024} MB`)
      : new HttpError(400, 'invalid_upload', err.message);
  } else if (err.code === 'ER_DUP_ENTRY') {
    e = new HttpError(409, 'duplicate', 'That already exists');
  } else if (err.type === 'entity.parse.failed') {
    e = new HttpError(400, 'invalid_json', 'The request body is not valid JSON');
  } else if (err.type === 'entity.too.large') {
    e = new HttpError(413, 'too_large', 'The request is too large');
  }
  if (!(e instanceof HttpError)) {
    console.error(err);
    e = new HttpError(500, 'server_error', 'Something went wrong');
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.vars ? { vars: e.vars } : {}) } });
});

async function start() {
  try {
    await db.init();
  } catch (err) {
    console.error(`[db] Could not connect to MySQL at ${config.db.user}@${config.db.host}:${config.db.port}: ${err.message}`);
    console.error('[db] Check DB_HOST, DB_PORT, DB_USER and DB_PASSWORD in backend/.env');
    process.exit(1);
  }
  await ensureLessonCatalog();
  if (config.seedDemoData && (await seedDemoData())) {
    console.log(`[db] Demo school added to "${config.db.database}" (every demo account's password is ${DEMO_PASSWORD})`);
  }
  await mailer.verify();
  const server = app.listen(config.port, () => {
    console.log(`Smart Learning API on http://localhost:${config.port}/api (database "${config.db.database}")`);
  });
  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

start();
