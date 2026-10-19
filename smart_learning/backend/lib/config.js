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

  // text messages through textbee (an Android phone running the textbee app sends them)
  sms: {
    apiKey: env.TEXTBEE_API_KEY || '',
    deviceId: env.TEXTBEE_DEVICE_ID || '',
    apiUrl: (env.TEXTBEE_API_URL || 'https://api.textbee.dev/api/v1').replace(/\/+$/, ''),
    // local numbers like 082 123 4567 get this country code (27 = South Africa)
    countryCode: (env.SMS_COUNTRY_CODE || '27').replace(/\D/g, ''),
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
