// /api/live: the live classroom of an online class, for its teacher and the learners in the
// class while it is open. Entering it (the stream) is what marks a learner in the register.
const express = require('express');
const auth = require('../lib/auth');
const onlineClasses = require('../lib/onlineClasses');
const liveRooms = require('../lib/liveRooms');
const livekit = require('../lib/livekit');
const { rateLimit } = require('../lib/rateLimit');
const http = require('../lib/http');
const config = require('../lib/config');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('teacher', 'learner'));

const MAX_SIGNAL_BYTES = 64 * 1024;
// Chat: a person typing never needs more than this. Signalling: setting up video sends many
// small messages (a teacher with a full class sends hundreds when everyone joins), so the
// limit only stops a flood.
const chatLimiter = rateLimit({ windowMs: 10 * 1000, max: 10, key: (req) => 'chat:' + req.user.id });
const signalLimiter = rateLimit({ windowMs: 60 * 1000, max: 3000, key: (req) => 'signal:' + req.user.id });
// a learner's camera picture: about one a second
const snapshotLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, key: (req) => 'snapshot:' + req.user.id });
const MAX_SNAPSHOT_CHARS = 200 * 1024;

function inRoomOrThrow(req) {
  const id = http.id(req.params.id);
  if (!liveRooms.inRoom(id, req.user.id)) throw http.badRequest('live_not_in_room', 'Enter the classroom first');
  return id;
}

// whether the classroom goes through the LiveKit video server (the meeting layout) or straight
// between devices
router.get('/media-server', async (req, res) => {
  res.json({ livekit: await livekit.reachable() });
});

// the person's event stream: welcome (who is here, the chat so far), joined, left, signal,
// chat, replaced (opened in another tab) and ended
router.get('/:id/stream', async (req, res) => {
  const oc = await onlineClasses.forClassroom(req.user, http.id(req.params.id));
  await liveRooms.enter(oc, req.user, req, res);
});

// Body: { to: user id, data: an offer, answer or ICE candidate }
router.post('/:id/signal', signalLimiter, (req, res) => {
  const id = inRoomOrThrow(req);
  const b = http.body(req);
  const to = http.id(b.to, 'to');
  if (!b.data || typeof b.data !== 'object' || JSON.stringify(b.data).length > MAX_SIGNAL_BYTES) {
    throw http.badRequest('invalid_field', 'data must be a WebRTC message', { field: 'data' });
  }
  if (!liveRooms.signal(id, req.user, to, b.data)) throw http.notFound('live_person_gone', 'That person is no longer in the classroom');
  res.status(204).end();
});

// Body: { image: a small JPEG data URL from the learner's camera, or null (camera off). Goes to
// the teacher, who sees the learner this way when the direct video can't connect.
router.post('/:id/snapshot', snapshotLimiter, (req, res) => {
  const id = inRoomOrThrow(req);
  const { image } = http.body(req);
  const ok = image === null
    || (typeof image === 'string' && image.length <= MAX_SNAPSHOT_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image));
  if (!ok) throw http.badRequest('invalid_field', 'image must be a small JPEG picture', { field: 'image' });
  if (!liveRooms.snapshot(id, req.user, image)) throw http.forbidden('live_snapshot_learner_only', 'Only learners send camera pictures');
  res.status(204).end();
});

// A pass into the class's LiveKit video room, for someone in the classroom. `url` is where to
// connect when it isn't the website's own /livekit address.
const tokenLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, key: (req) => 'media-token:' + req.user.id });
router.post('/:id/media-token', tokenLimiter, async (req, res) => {
  if (!livekit.enabled()) throw http.badRequest('live_media_server_off', 'The video server is not set up');
  const id = inRoomOrThrow(req);
  const oc = await onlineClasses.forClassroom(req.user, id);
  res.json({ token: livekit.joinToken(id, req.user, oc.teacher_id === req.user.id), url: config.livekit.publicUrl || null });
});

// Body: { learnerId }. The teacher sends a learner out of this class.
router.post('/:id/remove', (req, res) => {
  if (req.user.role !== 'teacher') throw http.forbidden('forbidden', 'Only the teacher can remove someone');
  const id = inRoomOrThrow(req);
  if (!liveRooms.remove(id, req.user, http.id(http.body(req).learnerId, 'learnerId'))) throw http.forbidden('forbidden', 'Only the teacher can remove someone');
  res.status(204).end();
});

// Body: { text }
router.post('/:id/chat', chatLimiter, (req, res) => {
  const id = inRoomOrThrow(req);
  const message = liveRooms.chat(id, req.user, http.text(http.body(req).text, 'text', { max: 500 }));
  res.status(201).json({ message });
});

module.exports = router;
