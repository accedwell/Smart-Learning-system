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
  seedDemoData: env.SEED_DEMO_DATA !== 'false',
  // learners can always sign up; a school administrator can only sign up while the
  // school has no administrator yet, unless this is switched on
  allowAdminSignup: env.ALLOW_ADMIN_SIGNUP === 'true',

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    // true for port 465 (TLS from the start); false for 587, which upgrades with STARTTLS
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : Number(env.SMTP_PORT) === 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || 'Smart Learning <no-reply@localhost>',
  },

  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: 5 * 1024 * 1024,

  ai: {
    enabled: env.AI_ENABLED !== 'false',
    model: env.CLAUDE_MODEL || 'claude-opus-5-5',
  },
};
