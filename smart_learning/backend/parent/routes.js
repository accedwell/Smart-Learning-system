// /api/parent: a parent only ever sees the learners the school administrator linked to them.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { lessonsFor, latestCheckin, statusFor } = require('../lib/learners');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('parent'));

async function linkedChildren(parentId) {
  return db.query(
    `SELECT u.* FROM parent_children pc JOIN users u ON u.id = pc.learner_id
      WHERE pc.parent_id = ? AND u.role = 'learner' ORDER BY u.name`,
    [parentId],
  );
}

const childSummary = (c) => ({ id: c.id, name: c.name, grade: c.grade, progress: c.progress });

router.get('/children', async (req, res) => {
  res.json({ children: (await linkedChildren(req.user.id)).map(childSummary) });
});

// progress, lessons, check-in and quiz marks for one linked child
router.get('/children/:id', async (req, res) => {
  const childId = http.id(req.params.id);
  const child = (await linkedChildren(req.user.id)).find((c) => c.id === childId);
  if (!child) throw http.notFound('child_not_found', 'This learner is not linked to your account');
  const checkin = await latestCheckin(child.id);
  // the first try at each quiz: the mark the teacher sees (later tries are practice, and a
  // retake in progress must not hide the mark)
  const marks = await db.query(
    `SELECT z.id AS quiz_id, z.title, z.subject_key, s.score, s.total, s.timed_out, s.submitted_at
       FROM quiz_submissions s JOIN quizzes z ON z.id = s.quiz_id
      WHERE s.learner_id = ? AND s.id = (
        SELECT MIN(s2.id) FROM quiz_submissions s2 WHERE s2.quiz_id = s.quiz_id AND s2.learner_id = s.learner_id)
      ORDER BY s.submitted_at DESC`,
    [child.id],
  );
  res.json({
    child: childSummary(child),
    status: checkin ? statusFor(checkin.score / checkin.total) : null,
    checkin,
    lessons: await lessonsFor(child),
    quizMarks: marks.map((m) => ({
      quizId: m.quiz_id, title: m.title, subjectKey: m.subject_key, score: m.score, total: m.total,
      timedOut: Boolean(m.timed_out), submittedAt: m.submitted_at,
    })),
  });
});

module.exports = router;
