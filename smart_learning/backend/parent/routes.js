// /api/parent: a parent only ever sees the learners the school administrator linked to them.
const express = require('express');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { childReport, writePdf } = require('../lib/report');
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

async function linkedChild(req) {
  const childId = http.id(req.params.id);
  const child = (await linkedChildren(req.user.id)).find((c) => c.id === childId);
  if (!child) throw http.notFound('child_not_found', 'This learner is not linked to your account');
  return child;
}

// the child's report: progress, status, lessons and assessments, quiz marks (first tries),
// the check-in quiz and online-class attendance
router.get('/children/:id', async (req, res) => {
  res.json(await childReport(await linkedChild(req)));
});

// the same report as a PDF to download
router.get('/children/:id/report.pdf', async (req, res) => {
  const child = await linkedChild(req);
  const report = await childReport(child);
  const fileName = `${child.name.replace(/[^\w]+/g, '-')}-progress-report.pdf`;
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  writePdf(report, req.user.name, res);
});

module.exports = router;
