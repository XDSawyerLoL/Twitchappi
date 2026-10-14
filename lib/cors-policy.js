'use strict';

const ENV_KEYS = [
  'APP_BASE_URL', 'PUBLIC_APP_URL', 'BILLING_SUCCESS_URL',
  'BILLING_CANCEL_URL', 'RENDER_EXTERNAL_URL', 'API_BASE_URL'
];

function safeOrigin(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch (_) { return null; }
}

function createCorsPolicy({env = process.env, isProd = false} = {}) {
  const explicit = String(env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const derived = ENV_KEYS.map(key => env[key]).filter(Boolean);
  const origins = (explicit.length ? explicit : derived).map(safeOrigin).filter(Boolean);
  if (origins.includes('https://swapp.tv')) origins.push('https://www.swapp.tv');
  if (origins.includes('https://www.swapp.tv')) origins.push('https://swapp.tv');
  if (!origins.length && !isProd) origins.push(
    'http://localhost:10000', 'http://127.0.0.1:10000',
    'http://localhost:3000', 'http://127.0.0.1:3000'
  );
  const allowedOrigins = [...new Set(origins)];
  function isOriginAllowed(origin) {
    if (!origin) return true; // Non-browser requests carry no Origin header.
    if (typeof origin !== 'string' || safeOrigin(origin) !== origin) return false;
    if (allowedOrigins.includes(origin)) return true;
    if (!isProd) return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
    return false;
  }
  function corsOriginHandler(origin, cb) {
    if (isOriginAllowed(origin)) return cb(null, true);
    const error = new Error('Origine refusée par CORS');
    error.code = 'CORS_ORIGIN_DENIED';
    error.status = 403;
    return cb(error);
  }
  return {allowedOrigins, isOriginAllowed, corsOriginHandler};
}

module.exports = {safeOrigin, createCorsPolicy};
