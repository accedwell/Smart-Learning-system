// South African ID numbers (13 digits: YYMMDD SSSS C A Z). Learners are added, and log in, with
// theirs. A number is accepted when it has a real month and day and its last digit (Z) is the
// Luhn check digit of the first twelve, which catches nearly every typing mistake.

// The ID number as 13 digits (spaces and dashes removed), or null if it can't be a real one.
function normalizeIdNumber(raw) {
  const d = String(raw == null ? '' : raw).replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(d)) return null;
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let n = Number(d[12 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0 ? d : null;
}

// whether a login name looks like an ID number rather than an email address
const looksLikeIdNumber = (value) => /^[\d\s-]{13,17}$/.test(String(value || '').trim());

module.exports = { normalizeIdNumber, looksLikeIdNumber };
