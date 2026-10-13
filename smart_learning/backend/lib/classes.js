// Classes (subject groups): one subject taught by one teacher to a group of learners, e.g.
// 10A Mathematics. A teacher sees only their own classes and the learners in them; a learner
// gets only the quizzes and papers sent to the classes they are in.
const db = require('./db');
const http = require('./http');

const MAX_CLASSES_PER_ITEM = 50;

// where each kind of item records the classes it was sent to
const LINKS = {
  quiz: { table: 'quiz_classes', column: 'quiz_id' },
  paper: { table: 'paper_classes', column: 'paper_id' },
};

function classView(c) {
  return { id: c.id, name: c.name, grade: c.grade, subjectKey: c.subject_key, teacherId: c.teacher_id };
}

// class ids from a JSON array, or from a form field ("3,4", or the field repeated)
function classIdsFrom(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value == null ? [] : [value];
  const ids = [...new Set(list.map((v) => http.id(typeof v === 'string' ? v.trim() : v, 'classIds')))];
  if (ids.length === 0) throw http.badRequest('teacher_class_pick_required', 'Choose at least one of your classes', { field: 'classIds' });
  if (ids.length > MAX_CLASSES_PER_ITEM) {
    throw http.badRequest('invalid_field', `classIds can list at most ${MAX_CLASSES_PER_ITEM} classes`, { field: 'classIds' });
  }
  return ids;
}

// The classes a teacher is sending a quiz or paper to: all their own, and of one grade and
// subject, which the quiz or paper then takes.
async function teacherClassesFor(teacherId, value) {
  const ids = classIdsFrom(value);
  const rows = await db.query('SELECT * FROM classes WHERE id IN (?) AND teacher_id = ?', [ids, teacherId]);
  if (rows.length !== ids.length) throw http.notFound('class_not_found', 'No such class among yours');
  if (rows.some((c) => c.grade !== rows[0].grade || c.subject_key !== rows[0].subject_key)) {
    throw http.badRequest('teacher_class_mixed', 'Choose classes of the same grade and subject', { field: 'classIds' });
  }
  return rows;
}

// replaces the classes a quiz or paper was sent to
async function sendToClasses(kind, itemId, classes, conn) {
  const { table, column } = LINKS[kind];
  await db.query(`DELETE FROM ${table} WHERE ${column} = ?`, [itemId], conn);
  await db.query(`INSERT INTO ${table} (${column}, class_id) VALUES ?`, [classes.map((c) => [itemId, c.id])], conn);
}

// quiz or paper id -> the ids of the classes it was sent to
async function classIdsOf(kind, itemIds) {
  const { table, column } = LINKS[kind];
  const byItem = new Map(itemIds.map((id) => [id, []]));
  if (itemIds.length === 0) return byItem;
  const rows = await db.query(`SELECT ${column} AS item_id, class_id FROM ${table} WHERE ${column} IN (?) ORDER BY class_id`, [itemIds]);
  for (const r of rows) byItem.get(r.item_id).push(r.class_id);
  return byItem;
}

// SQL condition: the quiz or paper `alias` was sent to a class one of the learners (a `?`
// parameter, one id or a list) is in
function sentToLearners(kind, alias) {
  const { table, column } = LINKS[kind];
  return `EXISTS (SELECT 1 FROM ${table} sent JOIN class_learners cl ON cl.class_id = sent.class_id
                   WHERE sent.${column} = ${alias}.id AND cl.learner_id IN (?))`;
}

async function teachesLearner(teacherId, learnerId) {
  const row = await db.one(
    'SELECT 1 FROM classes k JOIN class_learners cl ON cl.class_id = k.id WHERE k.teacher_id = ? AND cl.learner_id = ? LIMIT 1',
    [teacherId, learnerId],
  );
  return Boolean(row);
}

module.exports = { classView, teacherClassesFor, sendToClasses, classIdsOf, sentToLearners, teachesLearner };
