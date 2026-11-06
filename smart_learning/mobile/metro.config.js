// The app shows the same text as the website, in all 11 languages, by reading the web app's
// translation files (frontend/src/i18n) instead of keeping a copy of them here.
//
// With `npm run tunnel` (expo start --tunnel) a phone on any network reaches this computer only
// through the tunnel's https address, which goes to Metro. So Metro also passes /api on to the
// backend, and serves the online classroom page under /web (built by `npm run build:web`).
const fs = require('fs');
const http = require('http');
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

// a file of the built classroom page; anything else under /web is the page itself
function webFile(req, res) {
  const rel = decodeURIComponent(req.url.split(/[?#]/)[0].replace(/^\/web\/?/, ''));
  let file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('The online classroom page is not built: run `npm run build:web` in mobile/.');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => (req, res, next) => {
    if (req.url === '/api' || req.url.startsWith('/api/')) return toBackend(req, res);
    if (req.url === '/web' || req.url.startsWith('/web/')) return webFile(req, res);
    return metroMiddleware(req, res, next);
  },
};

module.exports = config;
