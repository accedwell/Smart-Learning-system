// The backend as a Vercel function: every request to the backend's site comes here (vercel.json).
// The first request of each new instance connects to the database (and makes sure its tables
// and lessons are there) before the app answers. Unlike `npm start`, nothing runs between
// requests, so the live classroom, which keeps its rooms in memory, can't be relied on here.
const db = require('../lib/db');
const { ensureLessonCatalog } = require('../lib/seed');
const app = require('../app');

let ready = null;
function prepare() {
  ready = ready || (async () => {
    await db.init();
    await ensureLessonCatalog();
  })().catch((err) => {
    ready = null; // the next request tries again
    throw err;
  });
  return ready;
}

module.exports = async (req, res) => {
  try {
    await prepare();
  } catch (err) {
    console.error(`[db] Could not connect to PostgreSQL at ${db.where()}: ${err.message}`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: { code: 'api_error_server', message: 'The database is not reachable' } }));
  }
  return app(req, res);
};
