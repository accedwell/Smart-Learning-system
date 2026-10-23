// The school catalog (grades, subjects, departments, check-in quiz, assessments) and the
// English labels the backend uses in AI prompts and notifications.
//
// catalog-data.json is the backend's own copy of what the frontend has in
// frontend/src/data/seed.js and frontend/src/i18n/strings.js. When you add a subject,
// grade, lesson or check-in question there, add it to catalog-data.json too.
const data = require('./catalog-data.json');

const catalog = {
  ROLES: data.roles,
  GRADES: data.grades,
  CLASS_LETTERS: data.classLetters,
  SUBJECT_GROUPS: data.subjectGroups,
  SUBJECT_OPTIONS: data.subjectGroups.flatMap((g) => g.subjects),
  DEPARTMENTS: data.subjectGroups.map((g) => ({ id: g.id, labelKey: g.labelKey })),
  LANGUAGES: data.languages,
  QUIZ_BANK: data.checkinQuiz,
  ASSESSMENTS_BANK: data.assessments,
};

// English label for an i18n key, with {name} placeholders filled in
function t(key, vars = {}) {
  const template = data.strings[key] || key;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// the department (subject group) a subject belongs to
function deptForSubject(subjectKey) {
  const group = catalog.SUBJECT_GROUPS.find((g) => g.subjects.includes(subjectKey));
  return group ? group.id : null;
}

// " Reply in isiZulu." etc., appended to AI prompts; '' for English or unknown languages
function langNote(lang) {
  const known = catalog.LANGUAGES.some((l) => l.value === lang);
  return !known || lang === 'English' ? '' : ` Reply in ${lang}.`;
}

module.exports = { catalog, t, deptForSubject, langNote };
