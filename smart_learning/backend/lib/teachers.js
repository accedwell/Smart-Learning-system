// Teacher overviews for the HOD and principal dashboards: attendance, performance,
// the learner ratings and whether their assigned interventions are done.
const db = require('./db');
const { bool } = require('./users');

async function loadRatings(teacherIds) {
  const byTeacher = new Map(teacherIds.map((tid) => [tid, []]));
  if (teacherIds.length === 0) return byTeacher;
  const rows = await db.query('SELECT teacher_id, rating FROM teacher_ratings WHERE teacher_id IN (?) ORDER BY id', [teacherIds]);
  for (const r of rows) byTeacher.get(r.teacher_id).push(r.rating);
  return byTeacher;
}

function summary(t, ratings) {
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    subjectKey: t.subject_key,
    dept: t.dept,
    gradeKey: t.teach_grade ? 'grade_' + t.teach_grade : null,
    attendance: t.attendance,
    performance: t.performance,
    workDone: bool(t.work_done),
    ratings: {
      count: ratings.length,
      average: avg == null ? null : Math.round(avg * 100) / 100,
      // how many 5-, 4-, 3-, 2- and 1-star ratings
      distribution: [5, 4, 3, 2, 1].map((v) => ({ stars: v, count: ratings.filter((r) => r === v).length })),
    },
  };
}

async function listTeachers({ dept } = {}) {
  const rows = dept
    ? await db.query("SELECT * FROM users WHERE role = 'teacher' AND dept = ? ORDER BY name", [dept])
    : await db.query("SELECT * FROM users WHERE role = 'teacher' ORDER BY name");
  const ratings = await loadRatings(rows.map((r) => r.id));
  return rows.map((r) => summary(r, ratings.get(r.id)));
}

async function getTeacher(id) {
  const row = await db.one("SELECT * FROM users WHERE id = ? AND role = 'teacher'", [id]);
  if (!row) return null;
  const ratings = await loadRatings([row.id]);
  return summary(row, ratings.get(row.id));
}

module.exports = { listTeachers, getTeacher };
