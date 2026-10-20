// A learner's progress report, for their parent: what the parent sees on screen and the PDF
// they can download.
const PDFDocument = require('pdfkit');
const db = require('./db');
const { t } = require('./catalog');
const { lessonsFor, latestCheckin, riskFrom } = require('./learners');

// the first try at each quiz: the mark the teacher sees and the one that counts towards being
// at risk (later tries are practice, and a retake in progress must not hide the mark)
async function firstTries(learnerId) {
  return db.query(
    `SELECT z.id AS quiz_id, z.title, z.subject_key, s.score, s.total, s.timed_out, s.submitted_at
       FROM quiz_submissions s JOIN quizzes z ON z.id = s.quiz_id
      WHERE s.learner_id = ? AND s.id = (
        SELECT MIN(s2.id) FROM quiz_submissions s2 WHERE s2.quiz_id = s.quiz_id AND s2.learner_id = s.learner_id)
      ORDER BY s.submitted_at DESC`,
    [learnerId],
  );
}

// the online classes of the learner's classes that have finished, with their register entry
async function attendance(learnerId) {
  const rows = await db.query(
    `SELECT oc.title, oc.starts_at, k.name AS class_name, k.subject_key, a.status, a.seconds_attended
       FROM online_classes oc
       JOIN class_learners cl ON cl.class_id = oc.class_id AND cl.learner_id = ?
       JOIN classes k ON k.id = oc.class_id
       LEFT JOIN online_attendance a ON a.online_class_id = oc.id AND a.learner_id = ?
      WHERE oc.ended_at IS NOT NULL OR oc.starts_at + INTERVAL oc.duration_min MINUTE < UTC_TIMESTAMP()
      ORDER BY oc.starts_at DESC`,
    [learnerId, learnerId],
  );
  const classes = rows.map((r) => ({
    title: r.title, startsAt: r.starts_at, className: r.class_name, subjectKey: r.subject_key,
    status: r.status || 'absent', minutes: r.seconds_attended ? Math.round(r.seconds_attended / 60) : 0,
  }));
  const count = (s) => classes.filter((c) => c.status === s).length;
  return { total: classes.length, present: count('present'), late: count('late'), absent: count('absent'), classes };
}

// everything in the report, for one learner
async function childReport(child) {
  const [lessons, checkin, marks, attended] = await Promise.all([
    lessonsFor(child), latestCheckin(child.id), firstTries(child.id), attendance(child.id),
  ]);
  const testAverage = marks.length ? marks.reduce((a, m) => a + m.score / m.total, 0) / marks.length : null;
  const risk = riskFrom({ testAverage, checkinPct: checkin ? checkin.score / checkin.total : null });
  return {
    child: { id: child.id, name: child.name, grade: child.grade, idNumber: child.id_number || '', progress: child.progress },
    status: risk.status,
    statusBasis: risk.basis,
    testAverage: testAverage == null ? null : Math.round(testAverage * 100),
    checkin,
    lessons,
    quizMarks: marks.map((m) => ({
      quizId: m.quiz_id, title: m.title, subjectKey: m.subject_key, score: m.score, total: m.total,
      timedOut: Boolean(m.timed_out), submittedAt: m.submitted_at,
    })),
    attendance: attended,
    generatedAt: new Date().toISOString(),
  };
}

// ---- the PDF ----

const NAVY = '#0f1a38';
const GOLD = '#b8791f';
const INK = '#182219';
const SOFT = '#5c6b5c';
const STATUS = { on_track: ['On track', '#2f9159'], watch: ['Needs some practice', '#c8871a'], at_risk: ['At risk', '#c0392b'] };

const day = (d) => new Date(d).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' });

// writes the report as a PDF to `out` (a response or file stream)
function writePdf(report, parentName, out) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Progress report – ${report.child.name}`, Author: 'Smart Learning' } });
  doc.pipe(out);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // header band
  doc.rect(0, 0, doc.page.width, 110).fill(NAVY);
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10).text('SMART LEARNING', left, 30, { characterSpacing: 1.5 });
  doc.fillColor('#ffffff').fontSize(22).text('Learner Progress Report', left, 46);
  doc.font('Helvetica').fontSize(10).fillColor('#d6dbe8').text(`Generated ${day(report.generatedAt)}`, left, 76);
  doc.y = 130;

  // who
  const facts = [
    ['Learner', report.child.name],
    ['Grade', report.child.grade ? t('grade_' + report.child.grade) : '–'],
    ...(report.child.idNumber ? [['ID number', report.child.idNumber]] : []),
    ['Parent / guardian', parentName],
  ];
  for (const [label, value] of facts) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(SOFT).text(label, left, y, { width: 130 });
    doc.font('Helvetica-Bold').fillColor(INK).text(value, left + 130, y);
    doc.moveDown(0.3);
  }

  // summary boxes: progress and status
  doc.moveDown(0.8);
  const boxY = doc.y;
  const boxW = (width - 16) / 2;
  const box = (x, title, value, color) => {
    doc.roundedRect(x, boxY, boxW, 64, 8).lineWidth(1).strokeColor('#e4ddc7').stroke();
    doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(title, x + 14, boxY + 12);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(color).text(value, x + 14, boxY + 28);
  };
  box(left, 'OVERALL PROGRESS THIS TERM', `${report.child.progress || 0}%`, GOLD);
  const [statusText, statusColor] = STATUS[report.status] || ['No results yet', SOFT];
  box(left + boxW + 16, 'STATUS', statusText, statusColor);
  doc.y = boxY + 64 + 6;
  const basis = report.statusBasis === 'tests' ? `Based on the first try at each of the teachers' tests (average ${report.testAverage}%).`
    : report.statusBasis === 'checkin' ? 'Based on the latest check-in quiz (no teacher tests taken yet).' : '';
  if (basis) doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(basis, left, doc.y, { width });

  // a section heading, starting a new page when little room is left
  const heading = (text) => {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(text, left);
    doc.moveTo(left, doc.y + 3).lineTo(left + width, doc.y + 3).lineWidth(1.5).strokeColor(GOLD).stroke();
    doc.moveDown(0.6);
  };
  // a table: columns [{ label, width (share of the page), align }], rows of strings
  const table = (cols, rows, empty) => {
    if (rows.length === 0) { doc.font('Helvetica').fontSize(10).fillColor(SOFT).text(empty, left); return; }
    const xs = [];
    let x = left;
    for (const c of cols) { xs.push(x); x += c.width * width; }
    const line = (cells, bold, color) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      let h = 0;
      cells.forEach((cell, i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(color || INK)
          .text(String(cell), xs[i] + 2, y, { width: cols[i].width * width - 6, align: cols[i].align || 'left' });
        h = Math.max(h, doc.y - y);
      });
      doc.y = y + h + 4;
      doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).lineWidth(0.5).strokeColor('#e4ddc7').stroke();
    };
    line(cols.map((c) => c.label), true, SOFT);
    for (const r of rows) line(r);
  };

  heading('Lessons & assessments');
  table(
    [{ label: 'Subject', width: 0.17 }, { label: 'Lesson', width: 0.27 }, { label: 'Progress', width: 0.12, align: 'right' },
      { label: 'Assessment', width: 0.32 }, { label: 'Due', width: 0.12 }],
    report.lessons.map((l) => {
      const subject = l.subjectKey ? t(l.subjectKey) : '';
      return [subject || '–', t(l.key, { subject }), l.done ? 'Completed' : `${l.progress}%`,
        l.assessment ? t(l.assessment.titleKey, { subject }) : '–', l.assessment ? l.assessment.due : '–'];
    }),
    'No lessons yet.',
  );

  heading("Quiz marks (first try at each of the teachers' tests)");
  table(
    [{ label: 'Quiz', width: 0.42 }, { label: 'Subject', width: 0.23 }, { label: 'Date', width: 0.2 }, { label: 'Mark', width: 0.15, align: 'right' }],
    report.quizMarks.map((m) => [m.title, m.subjectKey ? t(m.subjectKey) : '–', day(m.submittedAt),
      `${m.score}/${m.total} (${Math.round((m.score / m.total) * 100)}%)`]),
    "No teacher tests taken yet.",
  );
  if (report.checkin) {
    doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor(INK)
      .text(`Latest check-in quiz: ${report.checkin.score}/${report.checkin.total} (${day(report.checkin.takenAt)})`, left);
  }

  heading('Online classes attended');
  const a = report.attendance;
  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(a.total ? `${a.present} present · ${a.late} late · ${a.absent} absent, out of ${a.total} online class${a.total === 1 ? '' : 'es'}.` : 'No online classes have taken place yet.', left);
  if (a.total) {
    doc.moveDown(0.5);
    table(
      [{ label: 'Class', width: 0.42 }, { label: 'Subject', width: 0.23 }, { label: 'Date', width: 0.2 }, { label: 'Register', width: 0.15 }],
      a.classes.slice(0, 15).map((c) => [c.title, t(c.subjectKey), day(c.startsAt), c.status.charAt(0).toUpperCase() + c.status.slice(1)]),
      '',
    );
  }

  doc.moveDown(2).font('Helvetica').fontSize(8.5).fillColor(SOFT)
    .text('This report was produced by Smart Learning from the marks and activity recorded for the learner. For questions, contact the school.', left, doc.y, { width });
  doc.end();
}

module.exports = { childReport, writePdf };
