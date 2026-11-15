const crypto = require('crypto');

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const PROFILE_URL = 'https://login.yandex.ru/info';
const STATE_TTL_MS = 10 * 60 * 1000;

function config() {
  const clientId = String(process.env.YANDEX_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.YANDEX_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.YANDEX_REDIRECT_URI || 'https://fedfix.ru/api/auth/yandex/callback').trim();
  const publicSiteUrl = String(process.env.PUBLIC_SITE_URL || 'https://fedfix.ru').replace(/\/+$/, '');
  return { clientId, clientSecret, redirectUri, publicSiteUrl };
}

function isConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret && c.redirectUri);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createState() {
  const { clientSecret } = config();
  const body = base64url(JSON.stringify({
    t: Date.now(),
    n: base64url(crypto.randomBytes(16)),
  }));
  const sig = crypto.createHmac('sha256', clientSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const { clientSecret } = config();
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig || !clientSecret) return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(body).digest();
  let actual;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return false;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return Number.isFinite(payload?.t) && Date.now() - payload.t <= STATE_TTL_MS && Date.now() - payload.t >= -60_000;
  } catch {
    return false;
  }
}

function authorizeUrl(state) {
  const c = config();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', c.clientId);
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'login:email login:info');
  return url.toString();
}

async function exchangeCode(code) {
  const c = config();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code || ''),
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  if (!response.ok) throw new Error(`yandex token status ${response.status}`);
  const data = await response.json();
  const token = String(data.access_token || '');
  if (!token) throw new Error('yandex token missing');
  return token;
}

async function fetchProfile(accessToken) {
  const response = await fetch(`${PROFILE_URL}?format=json`, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!response.ok) throw new Error(`yandex profile status ${response.status}`);
  return response.json();
}

module.exports = {
  config,
  isConfigured,
  createState,
  verifyState,
  authorizeUrl,
  exchangeCode,
  fetchProfile,
};
