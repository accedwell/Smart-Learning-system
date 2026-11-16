// Smart Learning API server. Start with `npm run dev`; settings are in .env (see .env.example).
const config = require('./lib/config');
const db = require('./lib/db');
const { ensureLessonCatalog, seedDemoData, DEMO_PASSWORD } = require('./lib/seed');
const { pruneEvents } = require('./lib/security');
const mailer = require('./lib/mailer');
const app = require('./app');

async function start() {
  try {
    await db.init();
  } catch (err) {
    console.error(`[db] Could not connect to PostgreSQL at ${db.where()}: ${err.message}`);
    console.error('[db] Check DATABASE_URL, or DB_HOST, DB_PORT, DB_USER and DB_PASSWORD, in backend/.env');
    process.exit(1);
  }
  await ensureLessonCatalog();
  if (config.seedDemoData && (await seedDemoData())) {
    console.log(`[db] Demo school added to ${db.where()} (every demo account's password is ${DEMO_PASSWORD})`);
  }
  if (!(await db.one("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"))) {
    console.warn('[setup] There is no administrator yet. Create one with: npm run create-admin -- --name "Jane Doe" --email jane@school.org');
  }
  await pruneEvents(); // the security log keeps half a year
  await mailer.verify();
  const server = app.listen(config.port, () => {
    console.log(`Smart Learning API on http://localhost:${config.port}/api (database ${db.where()})`);
  });
  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

start();
