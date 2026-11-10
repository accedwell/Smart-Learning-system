// The online classroom's video and sound go through a LiveKit server (an SFU): everyone sends
// their camera, mic and screen to it once and it passes them on to the others. The backend
// only hands out passes (signed tokens) for the room of one online class, to people who may
// be in it, and asks LiveKit to remove someone the teacher sent out. The API secret never
// leaves the backend.
//
// Settings (backend/.env): LIVEKIT_URL (how the backend reaches LiveKit), LIVEKIT_API_KEY,
// LIVEKIT_API_SECRET, and LIVEKIT_PUBLIC_URL when the browsers should connect somewhere else
// than through the website's own /livekit address (e.g. wss://your-project.livekit.cloud).
const jwt = require('jsonwebtoken');
const config = require('./config');

const TOKEN_TTL_SECONDS = 6 * 60 * 60;

function enabled() {
  return Boolean(config.livekit.apiKey && config.livekit.apiSecret);
}

const roomName = (ocId) => 'online-class-' + ocId;

// Whether the LiveKit server answers right now (checked at most every 10 seconds). When it is
// down, the classroom falls back to sending video straight between devices, so a class can
// still go ahead.
let lastCheck = { at: 0, up: false };
async function reachable() {
  if (!enabled()) return false;
  if (Date.now() - lastCheck.at < 10 * 1000) return lastCheck.up;
  let up = false;
  try {
    const res = await fetch(config.livekit.url + '/', { signal: AbortSignal.timeout(1500) });
    up = res.status < 500;
  } catch {
    up = false;
  }
  lastCheck = { at: Date.now(), up };
  return up;
}

function sign(claims, ttlSeconds) {
  return jwt.sign(claims, config.livekit.apiSecret, {
    algorithm: 'HS256',
    issuer: config.livekit.apiKey,
    expiresIn: ttlSeconds,
    notBefore: 0,
  });
}

// A pass into the room of online class `ocId` for `user`. Everyone may send camera, mic and
// screen, and set their own attributes (the raised hand). The teacher is the room's host.
function joinToken(ocId, user, isHost) {
  return sign({
    sub: String(user.id),
    name: user.name,
    metadata: JSON.stringify({ role: user.role, host: isHost }),
    video: {
      room: roomName(ocId),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    },
  }, TOKEN_TTL_SECONDS);
}

// calls LiveKit's room API (Twirp over HTTP) as an administrator of that room
async function roomService(method, ocId, body) {
  const token = sign({ video: { room: roomName(ocId), roomAdmin: true } }, 60);
  const res = await fetch(`${config.livekit.url}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) throw new Error(`LiveKit ${method} answered ${res.status}`);
}

// takes a person out of the video room (they are also refused a new pass: see liveRooms)
function removeParticipant(ocId, userId) {
  return roomService('RemoveParticipant', ocId, { room: roomName(ocId), identity: String(userId) });
}

// closes the video room for everyone (the class ended)
function closeRoom(ocId) {
  return roomService('DeleteRoom', ocId, { room: roomName(ocId) });
}

module.exports = { enabled, reachable, roomName, joinToken, removeParticipant, closeRoom };
