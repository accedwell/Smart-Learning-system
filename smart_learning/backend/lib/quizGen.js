// Writes quiz questions from a document's text without AI: fill-in-the-missing-word questions
// whose answer is one short term the learner types (marked by exact match, ignoring case).
//   1. definitions: "Osmosis is the movement of water…" → "______ is the movement of water…"
//   2. key terms: words the document keeps using → blanked in a sentence that uses them
//   3. numbers: years and figures → blanked ("first described cells in ______")
// Sentences that are instructions, headings or questions themselves are skipped.

const STOPWORDS = new Set((
  'about above after again against along also although always among another answer answers any are around because ' +
  'been before being below between both cannot could does doing down during each either else enough even every ' +
  'example following from further given good great have having here however into itself just know large later least ' +
  'less like little made make many marks might more most much must name never next often only other otherwise over ' +
  'own part parts people place question questions rather really same section should show shown since small some ' +
  'something sometimes still such than that their them themselves then there these they thing things this those ' +
  'though three through thus together total under until upon used uses using very well were what when where whether ' +
  'which while whole whose will with within without would write years your called refers means known different ' +
  'important include includes including following answer study guide grade term page number learners learner ' +
  // common verbs: blanking these tests grammar, not the subject
  'controls control takes taken leaves enters enter release releases contains contain produces produce makes helps ' +
  'allows forms found described describes became become becomes happens happened occurs occur moves causes caused ' +
  'gives given keeps carries carried needs needed changes changed starts started first second third'
).split(' '));

// lines that tell the learner what to do, rather than teach something
const INSTRUCTION = /^(answer|write|read|complete|instructions?|note|time|total|marks?|question|section|name|date|class|grade|page|turn over|study the|use the|refer to|show (all|your)|number the)\b/i;
const BLANK = '______';
const MAX_QUESTIONS = 15;

function sentencesOf(text) {
  return text
    // a line break inside a paragraph is just wrapping; a blank line ends the paragraph
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' '))
    .join('\n')
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.replace(/^[\s•\-–*·]*(\(?[0-9ivx]+[.)]\s*)*/i, '').trim())
    .filter((s) => {
      const words = s.split(/\s+/).length;
      // a heading has no full stop; a long line without one is still worth using
      const sentenceLike = /[.!]$/.test(s) || words >= 12;
      return sentenceLike && words >= 6 && words <= 40 && s.length <= 260 && /[a-z]/.test(s) && !s.endsWith('?') && !s.endsWith(':') &&
        !INSTRUCTION.test(s) && !/\(\s*\d+\s*\)\s*$/.test(s) && (s.match(/[A-Za-z]/g) || []).length > s.length * 0.6;
    });
}

// words the document uses at least twice that are not common words: its key terms
function keyTerms(text) {
  const counts = new Map();
  for (const w of text.toLowerCase().match(/[a-z][a-z-]{4,}/g) || []) {
    if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return counts;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function blankOut(sentence, term) {
  const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'i');
  if (!re.test(sentence)) return null;
  const blanked = sentence.replace(re, BLANK);
  // keep the answer findable: never blank the only real word, and leave enough context
  return blanked.replace(new RegExp(escapeRe(BLANK), 'g'), '').trim().split(/\s+/).length >= 5 ? blanked : null;
}

function question(blanked) {
  return 'Fill in the missing word: ' + blanked.replace(/\s+([.,;!])/g, '$1');
}

function fromText(text, { max = MAX_QUESTIONS } = {}) {
  const sentences = sentencesOf(text);
  const counts = keyTerms(text);
  const candidates = []; // { text, answer, score, sentence }

  for (const s of sentences) {
    // 1. definitions: "<term> is/are/refers to/means …", or "… is called <term>."
    const def = s.match(/^(?:the |a |an )?([a-z][a-z-]+(?: [a-z][a-z-]+){0,2}) (is|are|refers to|means|is known as|are known as) (.{12,})$/i);
    if (def && !STOPWORDS.has(def[1].toLowerCase()) && def[1].length >= 4) {
      const blanked = blankOut(s, def[1]);
      if (blanked) candidates.push({ text: question(blanked), answer: def[1].toLowerCase(), score: 100 + (counts.get(def[1].toLowerCase()) || 0), sentence: s });
    }
    const called = s.match(/\b(?:is|are) (?:called|known as|named) (?:the |a |an )?([a-z][a-z-]+(?: [a-z][a-z-]+)?)\.?$/i);
    if (called) {
      const blanked = blankOut(s, called[1]);
      if (blanked) candidates.push({ text: question(blanked), answer: called[1].toLowerCase(), score: 95, sentence: s });
    }

    // 2. the sentence's most-used key term
    const words = (s.toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).filter((w) => !STOPWORDS.has(w));
    const best = words.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || b.length - a.length)[0];
    if (best && (counts.get(best) || 0) >= 2) {
      const blanked = blankOut(s, best);
      if (blanked) candidates.push({ text: question(blanked), answer: best, score: 40 + counts.get(best) * 5, sentence: s });
    }

    // 3. a year or other number
    const num = s.match(/\b(1[5-9]\d\d|20\d\d|\d+(?:[.,]\d+)?)\b/);
    if (num && !/^\d$/.test(num[1])) {
      const blanked = blankOut(s, num[1]);
      if (blanked) candidates.push({ text: question(blanked), answer: num[1], score: 30, sentence: s });
    }
  }

  // best first; one question per sentence and per answer, so the quiz covers different things
  const usedSentences = new Set();
  const usedAnswers = new Set();
  const out = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (usedSentences.has(c.sentence) || usedAnswers.has(c.answer)) continue;
    usedSentences.add(c.sentence);
    usedAnswers.add(c.answer);
    out.push({ text: c.text, answer: c.answer });
    if (out.length >= max) break;
  }
  return out;
}

// ---- the questions of a question paper ----
//
// "QUESTION 1" starts a section; what follows until the first numbered question (1.1, 1.2.3…)
// is its introduction, often data or a scenario the questions need, so it goes in front of each
// one. The answers aren't on the paper, so these come back with an empty answer for the teacher
// to fill in from the memo (or for AI to work out when it is set up).

const SECTION = /^QUESTION\s+(\d{1,2})\b/i;
// "1.1 Determine…", "3.1.2 Show…"; OCR often drops the dot: "32 If…" for "3.2 If…"
const NUMBERED = /^(\d{1,2})(?:\.|(?=\d\s))(\d{1,2})((?:\.\d{1,2})?)\s+(?=[A-Z(])(.*)$/;
// marks at the end of a line, as printed and as OCR mangles them: "(3)", "3)", "[10]", "[€))]"
const MARKS = /\s*(\(\s*\d{1,2}\s*\)|\d{1,2}\)|\[[^\]]{0,8}\]|\(\s*\d{1,2}\s*$)\s*$/;
// a typed answer can't be a drawing, a sketch or a proof
const CANT_TYPE = /^(draw|sketch|construct|complete the (table|diagram)|plot|shade|label|on the (diagram|grid)|prove|show that|hence,? (prove|show))/i;
// the end of the paper, which OCR can run into the last question
const PAPER_END = /\s*\b(TOTAL\s*:?\s*\d+|END OF (THE )?(QUESTION )?PAPER)\b.*$/i;

// a line of an introduction worth keeping: real words, or a row of data such as "43 48 62 52";
// what OCR makes of a diagram ("gi? TN > — \ rs L") is left out
function readableLine(line) {
  if (/^[\d\s.,;:%]+$/.test(line) && (line.match(/\d+/g) || []).length >= 4) return true;
  const letters = (line.match(/[A-Za-z]/g) || []).length;
  const words = (line.match(/[A-Za-z]{2,}/g) || []).length;
  return words >= 3 && letters >= line.replace(/\s/g, '').length * 0.6;
}
const PAGE_FURNITURE = /(copyright reserved|please turn over|please tun over|DBE\/|^CAPS\b|^\d{1,2}\s*$)/i;
const MAX_INTRO = 500;
const MAX_PAPER_QUESTIONS = 40;

function paperQuestions(text, { max = MAX_PAPER_QUESTIONS } = {}) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !PAGE_FURNITURE.test(l));
  const out = [];
  let section = null;
  let intro = [];
  let current = null;

  const finish = () => {
    if (!current) return;
    let body = current.lines.join(' ').replace(PAPER_END, '').replace(MARKS, '').replace(/\s+/g, ' ').trim();
    body = body.replace(MARKS, '').trim();
    if (body.split(/\s+/).length >= 4 && !CANT_TYPE.test(body)) {
      const lead = current.intro ? `${current.intro.slice(0, MAX_INTRO)} — ` : '';
      out.push({ text: `${lead}${current.number} ${body}`, answer: '', needsAnswer: true });
    }
    current = null;
  };

  for (const line of lines) {
    const sec = line.match(SECTION);
    if (sec) {
      finish();
      section = sec[1];
      intro = [];
      continue;
    }
    const num = line.match(NUMBERED);
    // only sub-questions of the current section count, so "43 48 62…" data or a date isn't taken for one
    if (num && section && num[1] === section) {
      finish();
      current = {
        number: `${num[1]}.${num[2]}${num[3]}`,
        lines: [num[4]],
        intro: intro.join(' ').replace(/\s+/g, ' ').trim(),
      };
      continue;
    }
    if (current) {
      // a question runs on until the next one; a line ending in marks closes it
      current.lines.push(line);
      if (MARKS.test(line)) finish();
    } else if (section && readableLine(line)) {
      intro.push(line);
    }
  }
  finish();
  return out.slice(0, max);
}

module.exports = { fromText, paperQuestions };
