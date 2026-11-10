// The app shows the same text as the website, in all 11 languages, by reading the web app's
// translation files (frontend/src/i18n) instead of keeping a copy of them here.
//
// With `npm run tunnel` (expo start --tunnel) a phone on any network reaches this computer only
// through the tunnel's https address, which goes to Metro. So Metro also passes /api on to the
// backend, and serves the online classroom page under /web (built by `npm run build:web`).
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../frontend/src/i18n')];

const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 4001;
const WEB_DIR = path.resolve(__dirname, '../frontend/dist-mobile');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// streams the request to the backend and its answer back (the live classroom's stream too)
function toBackend(req, res) {
  const upstream = http.request({ host: '127.0.0.1', port: BACKEND_PORT, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'network_error', message: 'The Smart Learning backend is not running' } }));
  });
  req.pipe(upstream);
}

// The classroom's video goes through the LiveKit server on this computer; through the tunnel
// a phone reaches it as /livekit here. Plain requests are passed on like /api ...
const LIVEKIT_PORT = Number(process.env.LIVEKIT_PORT) || 7880;
function toLivekit(req, res) {
  const upstream = http.request({ host: '127.0.0.1', port: LIVEKIT_PORT, method: req.method, path: req.url.replace(/^\/livekit/, '') || '/', headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('The LiveKit video server is not running');
  });
  req.pipe(upstream);
}
// ... and its WebSocket is joined straight to LiveKit's. Metro's own server takes the WebSocket
// upgrades (for reloading the app), and offers no hook for others, so this catches /livekit
// ones before it sees them.
const serverEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function emit(event, req, socket, head) {
  if (event !== 'upgrade' || !req.url.startsWith('/livekit/')) return serverEmit.apply(this, arguments);
  const upstream = net.connect(LIVEKIT_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url.replace(/^\/livekit/, '')} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  return true;
};

// a file of the built classroom page; anything else under /web is the page itself
function webFile(req, res) {
  const rel = decodeURIComponent(req.url.split(/[?#]/)[0].replace(/^\/web\/?/, ''));
  let file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('The online classroom page is not built: run `npm run build:web` in mobile/.');
  }
  // the page itself is always fetched fresh (so a phone gets a new build straight away); its
  // files have the build's hash in their names, so they may be kept
  const fresh = path.basename(file) === 'index.html';
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': fresh ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
}

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => (req, res, next) => {
    if (req.url === '/api' || req.url.startsWith('/api/')) return toBackend(req, res);
    if (req.url === '/web' || req.url.startsWith('/web/')) return webFile(req, res);
    if (req.url.startsWith('/livekit/')) return toLivekit(req, res);
    return metroMiddleware(req, res, next);
  },
};

module.exports = config;
