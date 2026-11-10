// Settings come from environment variables, loaded from backend/.env when present
// (see .env.example). Everything has a development default except the MySQL password.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET is not set: using a random one, so everyone is logged out when the server restarts.');
}

// every demo account (an administrator among them) shares a published password, so the
// demo school is on by default only in development and refused in production
const seedDemoData = env.SEED_DEMO_DATA ? env.SEED_DEMO_DATA === 'true' : !isProd;
if (isProd && seedDemoData) throw new Error('SEED_DEMO_DATA must not be true in production: the demo accounts have a published password');

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

module.exports = {
  ROOT,
  isProd,
  port: Number(env.PORT) || 4000,
  corsOrigins: list(env.CORS_ORIGIN || 'http://localhost:5173'),
  appUrl: env.APP_URL || 'http://localhost:5173',

  jwtSecret,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',

  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'smart_learning',
  },
  seedDemoData,

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    // true for port 465 (TLS from the start); false for 587, which upgrades with STARTTLS
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : Number(env.SMTP_PORT) === 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || 'Smart Learning <no-reply@localhost>',
  },

  // How the live classroom's video connections find a route between two devices: a public STUN
  // server, plus a TURN relay when TURN_URLS is set. Without a relay, a learner on mobile data
  // often can't reach a teacher on a school or office network (their routers block it).
  iceServers: [
    { urls: list(env.STUN_URLS || 'stun:stun.l.google.com:19302') },
    ...(env.TURN_URLS ? [{ urls: list(env.TURN_URLS), username: env.TURN_USERNAME || '', credential: env.TURN_CREDENTIAL || '' }] : []),
  ],

  // The LiveKit video server of the online classroom (see lib/livekit.js). Without a key and
  // secret the classroom sends video browser to browser instead (and needs TURN across networks).
  livekit: {
    url: (env.LIVEKIT_URL || 'http://127.0.0.1:7880').replace(/\/+$/, ''),
    publicUrl: (env.LIVEKIT_PUBLIC_URL || '').replace(/\/+$/, ''),
    apiKey: env.LIVEKIT_API_KEY || '',
    apiSecret: env.LIVEKIT_API_SECRET || '',
  },

  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: 5 * 1024 * 1024,

  ai: {
    enabled: env.AI_ENABLED !== 'false',
    model: env.CLAUDE_MODEL || 'claude-opus-5-5',
  },

  // the support chat runs in the Python chatbot service (smart_learning/chatbot)
  chatbot: {
    url: (env.CHATBOT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    secret: env.CHATBOT_SECRET || '',
  },
};
