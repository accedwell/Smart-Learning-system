// Small in-memory fixed-window rate limiters, for login attempts and the paid AI calls.
// Counts reset when the server restarts; put a shared store behind them if you run several instances.
const { HttpError } = require('./http');

// counts per key, each key's count starting over windowMs after its first hit
function windowCounter(windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  const current = (k) => {
    const entry = hits.get(k);
    return entry && entry.resetAt > Date.now() ? entry : null;
  };
  const add = (k) => {
    let entry = current(k);
    if (!entry) {
      entry = { count: 0, resetAt: Date.now() + windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    return entry;
  };
  return { current, add };
}

const secondsLeft = (entry) => Math.ceil((entry.resetAt - Date.now()) / 1000);

function refuse(res, wait) {
  res.set('Retry-After', String(wait));
  throw new HttpError(429, 'rate_limited', 'Too many requests, try again in a little while');
}

// every request counts
function rateLimit({ windowMs, max, key }) {
  const counter = windowCounter(windowMs);

  // counts one request for k; returns seconds to wait when over the limit, else 0
  function hit(k) {
    const entry = counter.add(k);
    return entry.count > max ? secondsLeft(entry) : 0;
  }

  const middleware = (req, res, next) => {
    const wait = hit(key(req));
    if (wait) refuse(res, wait);
    next();
  };
  // for best-effort extras: true when this request may go ahead
  middleware.allows = (req) => hit(key(req)) === 0;
  return middleware;
}

// Only failures count (wrong passwords). Once a key has had `max` of them in the window,
// check() refuses it, even with the right password, until the window ends.
function failureLimit({ windowMs, max }) {
  const counter = windowCounter(windowMs);
  return {
    check(res, k) {
      const entry = counter.current(k);
      if (entry && entry.count >= max) refuse(res, secondsLeft(entry));
    },
    fail(k) {
      counter.add(k);
    },
  };
}

// the AI features share one budget per user
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => 'user:' + req.user.id });

module.exports = { rateLimit, failureLimit, aiLimiter };
