// Fills an empty database with the demo school from the frontend prototype
// (frontend/src/data/seed.js), so every dashboard has something to show.
// Every demo account's password is Demo@1234. Runs only while the users table is empty.
const db = require('./db');
const { hashPassword } = require('./auth');
const { catalog, deptForSubject } = require('./catalog');
const { setSubjects } = require('./subjects');
const { ensureLessons, refreshProgress } = require('./learners');

const DEMO_PASSWORD = 'Demo@1234';
const LESSON_KEYS = ['lesson_1', 'lesson_2', 'lesson_3'];

const LEARNERS = [
  // the ID numbers are made up, but valid in form (date and check digit), so learners can log in with them
  // 7 subjects each: two languages, a mathematics, Life Orientation and three more (including the
  // Mathematics, English and Life Sciences classes they are in)
  { name: 'Thabo Mokoena', email: 'thabo@school.demo', idNumber: '1003155123089', grade: '10', lessons: [100, 60, 0], checkin: [5, 5],
    subjects: ['subject_2', 'subject_sesotho', 'subject_lo', 'subject_1', 'subject_physical_sciences', 'subject_3', 'subject_geography'] },
  { name: 'Lindiwe Khoza', email: 'lindiwe@school.demo', idNumber: '0906110245089', grade: '11', lessons: [80, 40, 0], checkin: [2, 5],
    subjects: ['subject_2', 'subject_isizulu', 'subject_lo', 'subject_1', 'subject_3', 'subject_accounting', 'subject_business'] },
  { name: 'Sipho Ndlovu', email: 'sipho@school.demo', idNumber: '1008225067083', grade: '10', lessons: [100, 20, 0], checkin: [3, 5],
    subjects: ['subject_2', 'subject_isizulu', 'subject_lo', 'subject_1', 'subject_3', 'subject_history', 'subject_geography'] },
];

const TEACHERS = [
  { name: 'Mrs. Dlamini', email: 'dlamini@school.demo', subjectKey: 'subject_1', grade: '10', ratings: [5, 4, 5, 3, 4, 5, 2, 4], attendance: 96, performance: 71, workDone: null },
  { name: 'Mr. Nkosi', email: 'nkosi@school.demo', subjectKey: 'subject_1', grade: '12', ratings: [5, 5, 4, 5, 5, 4], attendance: 92, performance: 74, workDone: true },
  { name: 'Mr. Khumalo', email: 'khumalo@school.demo', subjectKey: 'subject_2', grade: '11', ratings: [4, 4, 3, 5, 4, 4], attendance: 91, performance: 78, workDone: true },
  { name: 'Ms. van Wyk', email: 'vanwyk@school.demo', subjectKey: 'subject_afrikaans', grade: '10', ratings: [4, 3, 4, 4, 5], attendance: 89, performance: 73, workDone: null },
  { name: 'Ms. Mokoena', email: 'mokoena@school.demo', subjectKey: 'subject_lo', grade: '11', ratings: [4, 5, 4, 3, 4], attendance: 85, performance: 69, workDone: false },
  { name: 'Ms. Naidoo', email: 'naidoo@school.demo', subjectKey: 'subject_3', grade: '12', ratings: [5, 5, 4, 5, 3, 4, 4], attendance: 88, performance: 65, workDone: false },
  { name: 'Mr. Zulu', email: 'zulu@school.demo', subjectKey: 'subject_3', grade: '11', ratings: [5, 4, 5, 5, 4, 5, 3], attendance: 93, performance: 70, workDone: true },
];

const STAFF = [
  { name: 'Nomsa Mokoena', email: 'nomsa@school.demo', role: 'parent', children: ['thabo@school.demo'] },
  { name: 'Mrs. Dlamini', email: 'dlamini.hod@school.demo', role: 'hod', dept: 'mathematics' },
  { name: 'Mr. Sithole', email: 'sithole@school.demo', role: 'principal' },
  { name: 'Ms. Pillay', email: 'pillay@school.demo', role: 'admin' },
];

// classes (subject groups): Mrs. Dlamini teaches three Mathematics classes. Each quiz below
// goes to its teacher's classes of that grade and subject.
const CLASSES = [
  { name: '10A', grade: '10', subjectKey: 'subject_1', teacher: 'dlamini@school.demo', learners: ['thabo@school.demo'] },
  { name: '10B', grade: '10', subjectKey: 'subject_1', teacher: 'dlamini@school.demo', learners: ['sipho@school.demo'] },
  { name: '11A', grade: '11', subjectKey: 'subject_1', teacher: 'dlamini@school.demo', learners: ['lindiwe@school.demo'] },
  { name: '12A', grade: '12', subjectKey: 'subject_1', teacher: 'nkosi@school.demo', learners: [] },
  { name: '10A', grade: '10', subjectKey: 'subject_2', teacher: 'khumalo@school.demo', learners: ['thabo@school.demo', 'sipho@school.demo'] },
  { name: '11A', grade: '11', subjectKey: 'subject_2', teacher: 'khumalo@school.demo', learners: ['lindiwe@school.demo'] },
  { name: '12A', grade: '12', subjectKey: 'subject_2', teacher: 'khumalo@school.demo', learners: [] },
  { name: '10A', grade: '10', subjectKey: 'subject_3', teacher: 'naidoo@school.demo', learners: ['thabo@school.demo', 'sipho@school.demo'] },
  { name: '11A', grade: '11', subjectKey: 'subject_3', teacher: 'zulu@school.demo', learners: ['lindiwe@school.demo'] },
  { name: '12A', grade: '12', subjectKey: 'subject_3', teacher: 'naidoo@school.demo', learners: [] },
];

// one quiz per core subject for every grade, each set by that subject's teacher
const QUIZZES = [
  { teacher: 'dlamini@school.demo', title: 'Quick Practice Quiz', grade: '10', subjectKey: 'subject_1', questions: [
    ['What is 7 + 5?', '12'], ['What is 9 x 3?', '27'],
    ['What is the capital city of South Africa’s executive branch (Union Buildings)?', 'Pretoria'],
  ] },
  { teacher: 'dlamini@school.demo', title: 'Functions & Graphs Quiz', grade: '11', subjectKey: 'subject_1', questions: [
    ['What is the gradient of y = 2x + 3?', '2'], ['Solve for x: 3x = 15', '5'],
  ] },
  { teacher: 'nkosi@school.demo', title: 'Calculus Basics Quiz', grade: '12', subjectKey: 'subject_1', questions: [
    ['What is the derivative of x^2?', '2x'], ['What is the derivative of a constant?', '0'],
  ] },
  { teacher: 'khumalo@school.demo', title: 'Grammar & Vocabulary Quiz', grade: '10', subjectKey: 'subject_2', questions: [
    ['What is the past tense of "go"?', 'went'], ['Identify the noun: The dog barked loudly.', 'dog'],
  ] },
  { teacher: 'khumalo@school.demo', title: 'Comprehension Quiz', grade: '11', subjectKey: 'subject_2', questions: [
    ['What is a synonym for "happy"?', 'joyful'], ['What is the plural of "child"?', 'children'],
  ] },
  { teacher: 'khumalo@school.demo', title: 'Literary Devices Quiz', grade: '12', subjectKey: 'subject_2', questions: [
    ['What figure of speech compares two things using "like" or "as"?', 'simile'],
    ['What is the repetition of consonant sounds called?', 'alliteration'],
  ] },
  { teacher: 'naidoo@school.demo', title: 'Cell Biology Quiz', grade: '10', subjectKey: 'subject_3', questions: [
    ['What is the basic unit of life?', 'cell'], ['Which organelle produces energy in a cell?', 'mitochondria'],
  ] },
  { teacher: 'zulu@school.demo', title: 'Human Systems Quiz', grade: '11', subjectKey: 'subject_3', questions: [
    ['Which organ pumps blood around the body?', 'heart'], ['What gas do plants release during photosynthesis?', 'oxygen'],
  ] },
  { teacher: 'naidoo@school.demo', title: 'Genetics Quiz', grade: '12', subjectKey: 'subject_3', questions: [
    ['What molecule carries genetic information?', 'DNA'],
    ['What is a segment of DNA that codes for a protein called?', 'gene'],
  ] },
];

const QUIZ_RESULTS = [
  { quiz: 'Quick Practice Quiz', learner: 'thabo@school.demo', score: 3 },
  { quiz: 'Functions & Graphs Quiz', learner: 'lindiwe@school.demo', score: 1 },
];

const SUBJECT_STATS = [['subject_1', 94, 71], ['subject_2', 91, 78], ['subject_3', 88, 65]];

const PARENT_NOTIFICATIONS = ['notif_1', 'notif_2', 'notif_3'];

// lessons exist in every database, demo or not
// One lesson per subject. Mathematics, English and Life Sciences have their own lesson topics
// (lesson_1..3); every other subject gets "This term's {subject} work".
const OWN_LESSONS = { subject_1: 'lesson_1', subject_2: 'lesson_2', subject_3: 'lesson_3' };

async function ensureLessonCatalog() {
  for (const [i, key] of LESSON_KEYS.entries()) {
    await db.query('INSERT IGNORE INTO lessons (lesson_key, sort_order) VALUES (?, ?)', [key, i + 1]);
  }
  for (const [i, subject] of catalog.SUBJECT_OPTIONS.entries()) {
    const key = OWN_LESSONS[subject] || 'lesson_term_work:' + subject;
    await db.query(
      `INSERT INTO lessons (lesson_key, sort_order, subject_key) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), subject_key = VALUES(subject_key)`,
      [key, i + 1, subject],
    );
  }
}

async function seedDemoData() {
  // demo learners from before ID-number logins get their ID numbers (only where none is set)
  for (const l of LEARNERS) {
    await db.query("UPDATE users SET id_number = ? WHERE email = ? AND role = 'learner' AND id_number IS NULL", [l.idNumber, l.email])
      .catch(() => {}); // the number is taken by another account: leave this one without
  }
  // demo learners from before learners had subjects get their 7 (their lesson marks are kept)
  for (const l of LEARNERS) {
    const row = await db.one(
      "SELECT u.id FROM users u WHERE u.email = ? AND u.role = 'learner' AND NOT EXISTS (SELECT 1 FROM learner_subjects s WHERE s.learner_id = u.id)",
      [l.email],
    );
    if (!row) continue;
    await setSubjects(row.id, l.subjects);
    await ensureLessons(row.id);
    await refreshProgress(row.id);
  }
  // demo parent notifications from before they named the child ("{child} completed ...")
  await db.query(
    `UPDATE notifications n
       JOIN parent_children pc ON pc.parent_id = n.user_id
       JOIN users l ON l.id = pc.learner_id
        SET n.params = JSON_SET(COALESCE(n.params, JSON_OBJECT()), '$.child', l.name)
      WHERE n.msg_key IN (?) AND JSON_EXTRACT(n.params, '$.child') IS NULL`,
    [PARENT_NOTIFICATIONS],
  );
  const { n } = await db.one('SELECT COUNT(*) AS n FROM users');
  if (n > 0) return false;
  const hash = await hashPassword(DEMO_PASSWORD);

  await db.tx(async (conn) => {
    const ids = {};
    const addUser = async (fields) => {
      const res = await db.query('INSERT INTO users SET ?', [{ password_hash: hash, ...fields }], conn);
      ids[fields.email] = res.insertId;
      return res.insertId;
    };

    for (const l of LEARNERS) {
      const learnerId = await addUser({ name: l.name, email: l.email, id_number: l.idNumber, role: 'learner', grade: l.grade });
      await setSubjects(learnerId, l.subjects, conn);
      await ensureLessons(learnerId, conn);
      for (const [i, progress] of l.lessons.entries()) {
        await db.query(
          `UPDATE learner_lessons ll JOIN lessons ls ON ls.id = ll.lesson_id
              SET ll.progress = ?, ll.done = ?, ll.assessment_viewed = ?
            WHERE ll.learner_id = ? AND ls.lesson_key = ?`,
          [progress, progress === 100, progress === 100, learnerId, LESSON_KEYS[i]],
          conn,
        );
      }
      await refreshProgress(learnerId, conn);
      const [score, total] = l.checkin;
      // the seeded answers are only placeholders: correct ones first, then wrong ones
      const answers = Array.from({ length: total }, (_, i) => (i < score ? 0 : 1));
      await db.query('INSERT INTO checkin_attempts (learner_id, answers, score, total) VALUES (?, ?, ?, ?)',
        [learnerId, JSON.stringify(answers), score, total], conn);
    }

    for (const tc of TEACHERS) {
      const teacherId = await addUser({
        name: tc.name, email: tc.email, role: 'teacher', subject_key: tc.subjectKey, dept: deptForSubject(tc.subjectKey),
        teach_grade: tc.grade, attendance: tc.attendance, performance: tc.performance, work_done: tc.workDone,
      });
      for (const rating of tc.ratings) {
        await db.query('INSERT INTO teacher_ratings (teacher_id, rating) VALUES (?, ?)', [teacherId, rating], conn);
      }
    }

    for (const s of STAFF) {
      const userId = await addUser({ name: s.name, email: s.email, role: s.role, dept: s.dept || null });
      for (const childEmail of s.children || []) {
        await db.query('INSERT INTO parent_children (parent_id, learner_id) VALUES (?, ?)', [userId, ids[childEmail]], conn);
      }
      if (s.role === 'parent') {
        const child = LEARNERS.find((l) => l.email === (s.children || [])[0]);
        for (const [i, key] of PARENT_NOTIFICATIONS.entries()) {
          await db.query('INSERT INTO notifications (user_id, msg_key, params, is_read) VALUES (?, ?, ?, ?)',
            [userId, key, JSON.stringify({ timeKey: 'time_' + (i + 1), child: child ? child.name : '' }), i === 2], conn);
        }
      }
    }

    const classes = [];
    for (const c of CLASSES) {
      const res = await db.query('INSERT INTO classes (name, grade, subject_key, teacher_id) VALUES (?, ?, ?, ?)',
        [c.name, c.grade, c.subjectKey, ids[c.teacher]], conn);
      classes.push({ ...c, id: res.insertId });
      for (const learner of c.learners) {
        await db.query('INSERT INTO class_learners (class_id, learner_id) VALUES (?, ?)', [res.insertId, ids[learner]], conn);
      }
    }

    const quizIds = {};
    for (const q of QUIZZES) {
      const questions = q.questions.map(([text, answer]) => ({ text, answer }));
      const res = await db.query(
        'INSERT INTO quizzes (teacher_id, title, grade, subject_key, time_limit_min, questions) VALUES (?, ?, ?, ?, 3, ?)',
        [ids[q.teacher], q.title, q.grade, q.subjectKey, JSON.stringify(questions)],
        conn,
      );
      quizIds[q.title] = { id: res.insertId, total: questions.length };
      for (const c of classes.filter((k) => k.teacher === q.teacher && k.grade === q.grade && k.subjectKey === q.subjectKey)) {
        await db.query('INSERT INTO quiz_classes (quiz_id, class_id) VALUES (?, ?)', [res.insertId, c.id], conn);
      }
    }

    for (const r of QUIZ_RESULTS) {
      const quiz = quizIds[r.quiz];
      for (const table of ['quiz_attempts', 'quiz_submissions']) {
        await db.query(
          `INSERT INTO ${table} (quiz_id, learner_id, answers, score, total, started_at, submitted_at)
           VALUES (?, ?, '[]', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
          [quiz.id, ids[r.learner], r.score, quiz.total],
          conn,
        );
      }
    }

    for (const [key, attendance, performance] of SUBJECT_STATS) {
      await db.query('INSERT INTO subject_stats (subject_key, attendance, performance) VALUES (?, ?, ?)', [key, attendance, performance], conn);
    }
  });
  return true;
}

module.exports = { ensureLessonCatalog, seedDemoData, DEMO_PASSWORD };
