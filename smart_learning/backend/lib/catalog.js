// The school catalog (grades, subjects, departments, check-in quiz, assessments) and the
// English UI strings, imported from the frontend so both sides share one source of truth.
// The backend uses the strings to write AI prompts and notifications in plain English.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const config = require('./config');

const catalog = {};

async function load() {
  const importFrontend = (rel) => import(pathToFileURL(path.join(config.frontendSrc, rel)).href);
  const seed = await importFrontend('data/seed.js');
  const { UI } = await importFrontend('i18n/strings.js');
  Object.assign(catalog, {
    ROLES: seed.ROLES,
    GRADES: seed.GRADES,
    SUBJECT_GROUPS: seed.SUBJECT_GROUPS,
    SUBJECT_OPTIONS: seed.SUBJECT_OPTIONS,
    DEPARTMENTS: seed.DEPARTMENTS,
    LANGUAGES: seed.LANGUAGES,
    QUIZ_BANK: seed.QUIZ_BANK,
    ASSESSMENTS_BANK: seed.ASSESSMENTS_BANK,
    UI,
  });
}

// English label for an i18n key, with {name} placeholders filled in
function t(key, vars = {}) {
  const template = (catalog.UI && catalog.UI[key]) || key;
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

module.exports = { catalog, load, t, deptForSubject, langNote };
