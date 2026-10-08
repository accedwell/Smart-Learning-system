// Small in-memory fixed-window rate limiter, for login attempts and the paid AI calls.
// Counts reset when the server restarts; put a shared store behind it if you run several instances.
const { HttpError } = require('./http');

function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  // counts one request for k; returns seconds to wait when over the limit, else 0
  function hit(k) {
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  const middleware = (req, res, next) => {
    const wait = hit(key(req));
    if (wait) {
      res.set('Retry-After', String(wait));
      throw new HttpError(429, 'rate_limited', 'Too many requests, try again in a little while');
    }
    next();
  };
  // for best-effort extras: true when this request may go ahead
  middleware.allows = (req) => hit(key(req)) === 0;
  return middleware;
}

// the AI features share one budget per user
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => 'user:' + req.user.id });

module.exports = { rateLimit, aiLimiter };
