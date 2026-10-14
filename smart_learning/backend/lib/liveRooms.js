// The live classroom of each open online class, kept in memory. Every person in a room holds
// one server-sent-events stream (GET /api/live/:id/stream); the server passes WebRTC
// signalling messages between the teacher and each learner over it, and the room's chat.
// Video and audio go browser to browser: the teacher to every learner, and each learner (when
// they switch on their mic or camera) to the teacher only.
const onlineClasses = require('./onlineClasses');

const KEEPALIVE_MS = 25 * 1000;
const CHECK_ENDED_MS = 30 * 1000;
const MAX_CHAT_HISTORY = 100;

// online class id -> { oc, people: Map(userId -> { id, name, role, res }), chat: [], timer }
const rooms = new Map();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function person(p) {
  return { id: p.id, name: p.name, role: p.role };
}

function broadcast(room, event, data, exceptId) {
  for (const p of room.people.values()) if (p.id !== exceptId) send(p.res, event, data);
}

function roomFor(oc) {
  let room = rooms.get(oc.id);
  if (!room) {
    room = { oc, people: new Map(), chat: [] };
    // closes the room once the class's time is up
    room.timer = setInterval(async () => {
      try {
        const latest = await onlineClasses.find(oc.id);
        if (!latest || onlineClasses.phase(latest) === 'ended') end(oc.id);
      } catch (err) {
        console.error('[live] could not check the class', oc.id, err.message);
      }
    }, CHECK_ENDED_MS);
    rooms.set(oc.id, room);
  }
  return room;
}

// Adds `user` to the classroom of `oc` and turns `res` into their event stream. A second
// stream of the same person (another tab) replaces the first. The register is written before
// the stream opens, so a database error still answers as a normal error.
async function enter(oc, user, req, res) {
  if (user.role === 'learner') {
    if (inRoom(oc.id, user.id)) await onlineClasses.learnerLeft(oc.id, user.id);
    await onlineClasses.learnerEntered(oc, user.id);
  }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  const room = roomFor(oc);
  const previous = room.people.get(user.id);
  if (previous) {
    previous.replaced = true;
    send(previous.res, 'replaced', {});
    previous.res.end();
  }
  const me = { id: user.id, name: user.name, role: user.role, res };
  room.people.set(user.id, me);

  send(res, 'welcome', {
    you: person(me),
    teacherId: oc.teacher_id,
    participants: [...room.people.values()].filter((p) => p.id !== user.id).map(person),
    chat: room.chat,
  });
  // also after a refresh, so the teacher's side reconnects the video with the new page
  broadcast(room, 'joined', person(me), user.id);

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
  req.on('close', async () => {
    clearInterval(keepalive);
    if (room.people.get(user.id) === me) {
      room.people.delete(user.id);
      broadcast(room, 'left', { id: user.id });
    }
    if (user.role === 'learner' && !me.replaced) {
      try {
        await onlineClasses.learnerLeft(oc.id, user.id);
      } catch (err) {
        console.error('[live] could not record leaving', oc.id, user.id, err.message);
      }
    }
    if (room.people.size === 0 && rooms.get(oc.id) === room) {
      clearInterval(room.timer);
      rooms.delete(oc.id);
    }
  });
}

function inRoom(ocId, userId) {
  const room = rooms.get(ocId);
  return Boolean(room && room.people.has(userId));
}

// Passes a WebRTC message (offer, answer or ICE candidate) to one person. Only the teacher and
// a learner talk to each other: learners never reach other learners.
function signal(ocId, from, toId, data) {
  const room = rooms.get(ocId);
  const sender = room && room.people.get(from.id);
  const target = room && room.people.get(toId);
  if (!sender || !target) return false;
  if (sender.role === target.role) return false;
  send(target.res, 'signal', { from: from.id, data });
  return true;
}

function chat(ocId, from, text) {
  const room = rooms.get(ocId);
  if (!room || !room.people.has(from.id)) return null;
  const message = { from: person(from), text, at: new Date() };
  room.chat.push(message);
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat.shift();
  broadcast(room, 'chat', message);
  return message;
}

// who is in the classroom right now (for the teacher's register)
function presentIds(ocId) {
  const room = rooms.get(ocId);
  return room ? [...room.people.keys()] : [];
}

// the class ended or was cancelled: everyone is told, and their streams close (which records
// each learner's time)
function end(ocId) {
  const room = rooms.get(ocId);
  if (!room) return;
  for (const p of room.people.values()) {
    send(p.res, 'ended', {});
    p.res.end();
  }
}

module.exports = { enter, inRoom, signal, chat, presentIds, end };
