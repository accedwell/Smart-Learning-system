// PostgreSQL access. `init()` creates the database and tables on first start (so they show up
// in pgAdmin), then every query goes through one shared connection pool.
//
// The routes write SQL with `?` placeholders. query() turns them into PostgreSQL's $1, $2 …,
// and a value can stand for more than one:
//   an array        `IN (?)` with [1, 2]           -> IN ($1, $2)
//   rows            `VALUES ?` with [[1, 2], [3, 4]] -> VALUES ($1, $2), ($3, $4)
//   an object       `INSERT INTO t SET ?`          -> INSERT INTO t ("a", "b") VALUES ($1, $2)
//                   `UPDATE t SET ? WHERE …`        -> UPDATE t SET "a" = $1, "b" = $2 WHERE …
// true and false are stored as 1 and 0 (the flag columns are SMALLINT).
const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool, types } = require('pg');
const config = require('./config');

// COUNT() and SUM() give int8 and AVG() and ROUND() numeric, which the driver hands over as text
types.setTypeParser(types.builtins.INT8, (v) => Number(v));
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));

let pool = null;

// the tables, from db/schema.sql
function schemaStatements() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
    .split(/\r?\n/) // a Windows checkout has CRLF line endings
    .map((line) => line.replace(/(^|\s)--\s.*$/, '')) // drop "-- comments", which may contain a ';'
    .join('\n');
  return sql.split(';').map((s) => s.trim()).filter(Boolean);
}

// the database itself, created from the server's built-in "postgres" one (not for a
// DATABASE_URL: a hosted database comes already made)
async function createDatabase() {
  const { database } = config.db;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_NAME may only contain letters, digits and _');
  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${database}" ENCODING 'UTF8'`);
  } finally {
    await admin.end();
  }
}

async function init() {
  if (!config.db.connectionString) await createDatabase();
  // everything is stored and read as UTC
  pool = new Pool({ ...config.db, max: 10, options: '-c TimeZone=UTC' });
  for (const statement of schemaStatements()) await pool.query(statement);
}

const isRow = (v) => Array.isArray(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

function column(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Not a column name: ${name}`);
  return `"${name}"`;
}

// `sql` with ? placeholders and `params` -> PostgreSQL's { text, values } (see the top)
function toPostgres(sql, params = []) {
  const values = [];
  const add = (v) => {
    values.push(typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);
    return '$' + values.length;
  };
  let text = '';
  let quote = null;
  let next = 0;
  for (const ch of sql) {
    if (quote) {
      text += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      text += ch;
    } else if (ch !== '?') {
      text += ch;
    } else {
      const v = params[next++];
      if (isObject(v)) {
        const keys = Object.keys(v);
        if (/INSERT\s+INTO\s+\S+\s+SET\s*$/i.test(text)) {
          text = text.replace(/SET\s*$/i, '') + `(${keys.map(column).join(', ')}) VALUES (${keys.map((k) => add(v[k])).join(', ')})`;
        } else {
          text += keys.map((k) => `${column(k)} = ${add(v[k])}`).join(', ');
        }
      } else if (Array.isArray(v)) {
        if (!v.length) text += 'NULL'; // IN (NULL) matches nothing
        else if (v.every(isRow)) text += v.map((row) => `(${row.map(add).join(', ')})`).join(', ');
        else text += v.map(add).join(', ');
      } else {
        text += add(v);
      }
    }
  }
  // an INSERT hands back its new rows, for insertId
  if (/^\s*INSERT\b/i.test(text) && !/\bRETURNING\b/i.test(text)) text += ' RETURNING *';
  return { text, values };
}

// rows for a SELECT, or the result header ({ insertId, affectedRows }) for a write
async function query(sql, params = [], conn = pool) {
  const { text, values } = toPostgres(sql, params);
  const result = await conn.query(text, values);
  if (result.command === 'SELECT') return result.rows;
  return { insertId: result.rows && result.rows[0] ? result.rows[0].id : undefined, affectedRows: result.rowCount };
}

async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

// runs fn(conn) inside a transaction; pass conn to query()/one() inside it
async function tx(fn) {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const result = await fn(conn);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// "user@host:port/database" for messages (never the password)
function where() {
  if (!config.db.connectionString) return `${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`;
  try {
    const url = new URL(config.db.connectionString);
    return `${url.username}@${url.host}${url.pathname}`;
  } catch {
    return 'DATABASE_URL';
  }
}

// whether an error is a clash with a UNIQUE key (e.g. that class already exists)
const isDuplicate = (err) => Boolean(err) && err.code === '23505';

async function close() {
  if (pool) await pool.end();
}

module.exports = { init, query, one, tx, isDuplicate, where, close };
