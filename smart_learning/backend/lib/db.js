// MySQL access. `init()` creates the database and tables on first start (so they show up
// in MySQL Workbench), then every query goes through one shared connection pool.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

// the tables, from db/schema.sql; its CREATE DATABASE/USE lines are skipped because the
// database name comes from DB_NAME
function schemaStatements() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/(^|\s)--\s.*$/, '')) // drop "-- comments" (none contain a ';')
    .join('\n');
  return sql.split(';').map((s) => s.trim()).filter((s) => s && !/^(CREATE DATABASE|USE)\b/i.test(s));
}

async function init() {
  const { database, ...server } = config.db;
  const admin = await mysql.createConnection(server);
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally {
    await admin.end();
  }
  // everything is stored and read as UTC, including the CURRENT_TIMESTAMP column defaults
  pool = mysql.createPool({ ...config.db, connectionLimit: 10, timezone: 'Z', supportBigNumbers: true });
  pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  for (const statement of schemaStatements()) await pool.query(statement);
}

// rows for a SELECT, or the result header ({ insertId, affectedRows }) for a write
async function query(sql, params = [], conn = pool) {
  const [result] = await conn.query(sql, params);
  return result;
}

async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

// runs fn(conn) inside a transaction; pass conn to query()/one() inside it
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { init, query, one, tx, close };
