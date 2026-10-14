// /api/live: the live classroom of an online class, for its teacher and the learners in the
// class while it is open. Entering it (the stream) is what marks a learner in the register.
const express = require('express');
const auth = require('../lib/auth');
const onlineClasses = require('../lib/onlineClasses');
const liveRooms = require('../lib/liveRooms');
const http = require('../lib/http');

const router = express.Router();
router.use(auth.requireAuth(), auth.requireRole('teacher', 'learner'));

const MAX_SIGNAL_BYTES = 64 * 1024;

function inRoomOrThrow(req) {
  const id = http.id(req.params.id);
  if (!liveRooms.inRoom(id, req.user.id)) throw http.badRequest('live_not_in_room', 'Enter the classroom first');
  return id;
}

// the person's event stream: welcome (who is here, the chat so far), joined, left, signal,
// chat, replaced (opened in another tab) and ended
router.get('/:id/stream', async (req, res) => {
  const oc = await onlineClasses.forClassroom(req.user, http.id(req.params.id));
  await liveRooms.enter(oc, req.user, req, res);
});

// Body: { to: user id, data: an offer, answer or ICE candidate }
router.post('/:id/signal', (req, res) => {
  const id = inRoomOrThrow(req);
  const b = http.body(req);
  const to = http.id(b.to, 'to');
  if (!b.data || typeof b.data !== 'object' || JSON.stringify(b.data).length > MAX_SIGNAL_BYTES) {
    throw http.badRequest('invalid_field', 'data must be a WebRTC message', { field: 'data' });
  }
  if (!liveRooms.signal(id, req.user, to, b.data)) throw http.notFound('live_person_gone', 'That person is no longer in the classroom');
  res.status(204).end();
});

// Body: { text }
router.post('/:id/chat', (req, res) => {
  const id = inRoomOrThrow(req);
  const message = liveRooms.chat(id, req.user, http.text(http.body(req).text, 'text', { max: 500 }));
  res.status(201).json({ message });
});

module.exports = router;
