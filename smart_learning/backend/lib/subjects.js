// A learner's subjects. In the FET phase (grades 10–12) every learner takes 7 subjects: two
// official languages (a home language and a first additional language), Mathematics or
// Mathematical Literacy or Technical Mathematics, Life Orientation, and three more.
const db = require('./db');
const { catalog } = require('./catalog');
const http = require('./http');

const SUBJECT_COUNT = 7;
const LIFE_ORIENTATION = 'subject_lo';
const MATHS = ['subject_1', 'subject_math_lit', 'subject_tech_math'];
const LANGUAGES = catalog.SUBJECT_GROUPS.find((g) => g.id === 'languages').subjects.filter((s) => s !== LIFE_ORIENTATION);

// the 7 subjects as a clean list, or a 400 saying which rule they break
function checkLearnerSubjects(value) {
  const list = [...new Set((Array.isArray(value) ? value : []).map(String))];
  const unknown = list.find((s) => !catalog.SUBJECT_OPTIONS.includes(s));
  if (unknown) throw http.badRequest('invalid_field', `Unknown subject: ${unknown}`, { field: 'subjects' });
  if (list.length !== SUBJECT_COUNT) {
    throw http.badRequest('admin_error_subject_count', `Choose exactly ${SUBJECT_COUNT} subjects`, { field: 'subjects', n: SUBJECT_COUNT });
  }
  if (!list.includes(LIFE_ORIENTATION)) throw http.badRequest('admin_error_subject_lo', 'Life Orientation is compulsory', { field: 'subjects' });
  if (list.filter((s) => MATHS.includes(s)).length !== 1) {
    throw http.badRequest('admin_error_subject_maths', 'Choose one of Mathematics, Mathematical Literacy or Technical Mathematics', { field: 'subjects' });
  }
  if (list.filter((s) => LANGUAGES.includes(s)).length < 2) {
    throw http.badRequest('admin_error_subject_languages', 'Choose two languages: a home language and a first additional language', { field: 'subjects' });
  }
  // in the catalog's order, so every screen lists them the same way
  return catalog.SUBJECT_OPTIONS.filter((s) => list.includes(s));
}

async function subjectsOf(learnerId, conn) {
  const rows = await db.query('SELECT subject_key FROM learner_subjects WHERE learner_id = ?', [learnerId], conn);
  const mine = rows.map((r) => r.subject_key);
  return catalog.SUBJECT_OPTIONS.filter((s) => mine.includes(s));
}

// learner id -> their subjects, for many learners at once
async function subjectsByLearner(learnerIds) {
  const out = new Map(learnerIds.map((id) => [id, []]));
  if (!learnerIds.length) return out;
  for (const r of await db.query('SELECT learner_id, subject_key FROM learner_subjects WHERE learner_id IN (?)', [learnerIds])) {
    out.get(r.learner_id).push(r.subject_key);
  }
  for (const [id, list] of out) out.set(id, catalog.SUBJECT_OPTIONS.filter((s) => list.includes(s)));
  return out;
}

async function setSubjects(learnerId, subjects, conn) {
  await db.query('DELETE FROM learner_subjects WHERE learner_id = ?', [learnerId], conn);
  for (const s of subjects) await db.query('INSERT INTO learner_subjects (learner_id, subject_key) VALUES (?, ?)', [learnerId, s], conn);
}

module.exports = { SUBJECT_COUNT, checkLearnerSubjects, subjectsOf, subjectsByLearner, setSubjects };
