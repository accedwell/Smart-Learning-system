// Online classes: a teacher schedules a lesson for one of their classes, held in the app's
// own live classroom (see lib/liveRooms.js). A learner entering the classroom fills in the
// class register, with the time they spent there; the teacher can correct any mark.
const db = require('./db');
const http = require('./http');

// the classroom opens this long before the start and stays open until the class ends
const JOIN_EARLY_MS = 15 * 60 * 1000;
// entering more than this long after the start counts as late
const LATE_AFTER_MS = 10 * 60 * 1000;
const MIN_DURATION = 10;
const MAX_DURATION = 240;
// a class may start a little in the past ("start now"), and at most a year ahead
const START_SLACK_MS = 10 * 60 * 1000;
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const ATTENDANCE = ['present', 'late', 'absent'];

const SELECT = `SELECT oc.*, k.name AS class_name, k.grade, k.subject_key
                  FROM online_classes oc JOIN classes k ON k.id = oc.class_id`;

function startsAt(value) {
  const d = typeof value === 'string' && value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw http.badRequest('invalid_field', 'startsAt must be a date and time', { field: 'startsAt' });
  const now = Date.now();
  if (d.getTime() < now - START_SLACK_MS) throw http.badRequest('online_error_past', 'Choose a start time in the future', { field: 'startsAt' });
  if (d.getTime() > now + MAX_AHEAD_MS) throw http.badRequest('invalid_field', 'startsAt is too far ahead', { field: 'startsAt' });
  return d;
}

function duration(value) {
  return http.int(value, 'durationMin', { min: MIN_DURATION, max: MAX_DURATION });
}

function endsAt(oc) {
  return oc.ended_at || new Date(new Date(oc.starts_at).getTime() + oc.duration_min * 60 * 1000);
}

// 'upcoming' (not open yet), 'open' (the classroom is open) or 'ended'
function phase(oc, now = Date.now()) {
  if (oc.ended_at || now >= endsAt(oc).getTime()) return 'ended';
  return now >= new Date(oc.starts_at).getTime() - JOIN_EARLY_MS ? 'open' : 'upcoming';
}

function view(oc) {
  return {
    id: oc.id,
    classId: oc.class_id,
    className: oc.class_name,
    grade: oc.grade,
    subjectKey: oc.subject_key,
    title: oc.title,
    startsAt: oc.starts_at,
    durationMin: oc.duration_min,
    endsAt: endsAt(oc),
    endedEarly: Boolean(oc.ended_at),
    phase: phase(oc),
  };
}

async function find(id) {
  return db.one(`${SELECT} WHERE oc.id = ?`, [id]);
}

// The online class `id` if `user` may be in its classroom: its own teacher, or a learner in
// the class. Throws 404 otherwise, and 400 while the classroom is not open.
async function forClassroom(user, id) {
  const oc = await find(id);
  const allowed = oc && (
    (user.role === 'teacher' && oc.teacher_id === user.id) ||
    (user.role === 'learner' && await db.one('SELECT 1 FROM class_learners WHERE class_id = ? AND learner_id = ?', [oc.class_id, user.id]))
  );
  if (!allowed) throw http.notFound('online_class_not_found', 'No such online class');
  const p = phase(oc);
  if (p === 'upcoming') throw http.badRequest('online_error_not_open', 'This class has not opened yet');
  if (p === 'ended') throw http.badRequest('online_error_ended', 'This class has ended');
  return oc;
}

// A learner entered the classroom: present, or late after the first minutes. A mark the
// teacher made is kept, except "absent" given before the learner had come in at all. (MySQL
// applies the SET list left to right, so the status check still sees the old joined_at.)
async function learnerEntered(oc, learnerId) {
  const status = Date.now() > new Date(oc.starts_at).getTime() + LATE_AFTER_MS ? 'late' : 'present';
  await db.query(
    `INSERT INTO online_attendance (online_class_id, learner_id, status, joined_at, last_joined_at, marked_by)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'join')
     ON DUPLICATE KEY UPDATE
       status = IF(joined_at IS NULL AND status = 'absent', VALUES(status), status),
       joined_at = COALESCE(joined_at, VALUES(joined_at)),
       last_joined_at = UTC_TIMESTAMP()`,
    [oc.id, learnerId, status],
  );
}

// the learner left: their visit is added to the time they spent in the classroom
async function learnerLeft(ocId, learnerId) {
  await db.query(
    `UPDATE online_attendance
        SET seconds_attended = seconds_attended + GREATEST(0, TIMESTAMPDIFF(SECOND, last_joined_at, UTC_TIMESTAMP())),
            last_joined_at = NULL
      WHERE online_class_id = ? AND learner_id = ? AND last_joined_at IS NOT NULL`,
    [ocId, learnerId],
  );
}

// minutes in the classroom so far, counting a visit still going on
function minutesAttended(row) {
  let seconds = row.seconds_attended || 0;
  if (row.last_joined_at) seconds += Math.max(0, (Date.now() - new Date(row.last_joined_at).getTime()) / 1000);
  return Math.round(seconds / 60);
}

module.exports = {
  ATTENDANCE, SELECT, startsAt, duration, phase, view, find, forClassroom, learnerEntered, learnerLeft, minutesAttended,
};
