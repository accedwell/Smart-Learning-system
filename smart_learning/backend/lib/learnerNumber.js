// Learner numbers: the number the school gives each learner (their admission number), e.g.
// 20250147 or SL1002. Learners are added, and log in, with theirs.

// The learner number in capitals with spaces removed, or null if it can't be one: 3 to 20
// letters and digits, which a dash or slash may separate (2025/0147).
function normalizeLearnerNumber(raw) {
  const n = String(raw == null ? '' : raw).replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9][A-Z0-9/-]{1,18}[A-Z0-9]$/.test(n) ? n : null;
}

// whether a login name is a learner number rather than an email address
const looksLikeLearnerNumber = (value) => !String(value || '').includes('@');

module.exports = { normalizeLearnerNumber, looksLikeLearnerNumber };
