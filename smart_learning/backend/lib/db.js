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
    .split(/\r?\n/) // a Windows checkout has CRLF line endings
    .map((line) => line.replace(/(^|\s)--\s.*$/, '')) // drop "-- comments", which may contain a ';'
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
  await migrate();
}

// Changes to tables an older version already created (CREATE TABLE IF NOT EXISTS leaves
// those as they were). Each runs only while it is still needed.
const MIGRATIONS = [
  { table: 'online_classes', column: 'meeting_url', exists: true, sql: 'DROP COLUMN meeting_url' },
  { table: 'online_attendance', column: 'last_joined_at', exists: false, sql: 'ADD COLUMN last_joined_at DATETIME NULL AFTER joined_at' },
  { table: 'online_attendance', column: 'seconds_attended', exists: false, sql: 'ADD COLUMN seconds_attended INT NOT NULL DEFAULT 0 AFTER last_joined_at' },
  { table: 'papers', column: 'extracted_text', exists: false, sql: 'ADD COLUMN extracted_text MEDIUMTEXT NULL AFTER size_bytes' },
  { table: 'lessons', column: 'subject_key', exists: false, sql: 'ADD COLUMN subject_key VARCHAR(60) NULL AFTER sort_order' },
];

// Other changes to existing tables: `needed` is a query that returns a row while the change
// still has to be made, and `sql` the statements that make it.
const CHANGES = [
  // learners are added with their ID number and need no email address of their own
  {
    needed: "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email' AND IS_NULLABLE = 'NO'",
    sql: ['ALTER TABLE users MODIFY email VARCHAR(254) NULL'],
  },
  // one account per ID number (empty values become NULL first, which the index allows many of)
  {
    needed: "SELECT 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id_number' AND NON_UNIQUE = 0)",
    sql: ["UPDATE users SET id_number = NULL WHERE id_number = ''", 'ALTER TABLE users ADD UNIQUE INDEX uq_users_id_number (id_number)'],
  },
];

async function migrate() {
  for (const m of MIGRATIONS) {
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [m.table, m.column],
    );
    if ((rows.length > 0) === m.exists) await pool.query(`ALTER TABLE \`${m.table}\` ${m.sql}`);
  }
  for (const change of CHANGES) {
    const [rows] = await pool.query(change.needed);
    if (rows.length) for (const sql of change.sql) await pool.query(sql);
  }
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
