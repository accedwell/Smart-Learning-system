// Teacher-authored quizzes: validation, the two views (teachers see the answers, learners
// never do) and marking.
const { catalog } = require('./catalog');
const http = require('./http');

const MAX_QUESTIONS = 50;

function parseQuiz(b) {
  const questions = (Array.isArray(b.questions) ? b.questions : [])
    .map((q) => ({
      text: typeof (q && q.text) === 'string' ? q.text.trim() : '',
      answer: typeof (q && q.answer) === 'string' ? q.answer.trim() : '',
    }))
    .filter((q) => q.text && q.answer);
  if (questions.length === 0) throw http.badRequest('quiz_error_no_questions', 'Add at least one question with an answer');
  if (questions.length > MAX_QUESTIONS) throw http.badRequest('quiz_error_too_many', `A quiz can have at most ${MAX_QUESTIONS} questions`);
  if (questions.some((q) => q.text.length > 1000 || q.answer.length > 200)) {
    throw http.badRequest('quiz_error_too_long', 'Questions are limited to 1000 characters and answers to 200');
  }
  return {
    title: http.text(b.title, 'title', { max: 150 }),
    grade: http.oneOf(String(b.grade), catalog.GRADES, 'grade'),
    subject_key: http.oneOf(b.subjectKey, catalog.SUBJECT_OPTIONS, 'subjectKey'),
    time_limit_min: b.timeLimitMin ? http.int(b.timeLimitMin, 'timeLimitMin', { min: 0, max: 180 }) : 0,
    questions,
  };
}

function teacherView(q) {
  return {
    id: q.id, teacherId: q.teacher_id, title: q.title, grade: q.grade, subjectKey: q.subject_key,
    timeLimitMin: q.time_limit_min, questions: q.questions, createdAt: q.created_at,
  };
}

function learnerView(q) {
  return {
    id: q.id, title: q.title, grade: q.grade, subjectKey: q.subject_key, timeLimitMin: q.time_limit_min,
    teacherName: q.teacher_name || null, questionCount: q.questions.length,
    questions: q.questions.map((x) => ({ text: x.text })),
  };
}

// case-insensitive exact match per question, as the prototype marked
function mark(quiz, answers) {
  let score = 0;
  quiz.questions.forEach((q, i) => {
    const given = typeof answers[i] === 'string' ? answers[i].trim().toLowerCase() : '';
    if (given && given === q.answer.trim().toLowerCase()) score++;
  });
  return score;
}

module.exports = { parseQuiz, teacherView, learnerView, mark };
