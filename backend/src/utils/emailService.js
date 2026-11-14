const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function loadEnvFile() {
  const file = path.join(__dirname, '..', '..', '.env');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile();

function config() {
  const smtpUrl = String(process.env.SMTP_URL || '').trim();
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.EMAIL_FROM || user || '').trim();
  return {
    smtpUrl,
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
    user,
    pass,
    from,
    publicSiteUrl: String(process.env.PUBLIC_SITE_URL || 'https://www.fedfix.ru').replace(/\/+$/, ''),
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.from && (c.smtpUrl || c.host));
}

let transport = null;
let transportKey = '';

function getTransport() {
  const c = config();
  if (!isConfigured()) throw new Error('Отправка почты не настроена');
  const key = [c.smtpUrl, c.host, c.port, c.secure, c.user, c.pass].join('|');
  if (transport && key === transportKey) return transport;
  transportKey = key;
  transport = c.smtpUrl
    ? nodemailer.createTransport(c.smtpUrl)
    : nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
        connectionTimeout: 12_000,
        greetingTimeout: 12_000,
        socketTimeout: 20_000,
      });
  return transport;
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendVerificationEmail({ email, name, token }) {
  const c = config();
  const link = `${c.publicSiteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Подтверждение email — FixNet CRM';
  const text = [
    `Здравствуйте, ${name || 'пользователь'}!`,
    '',
    'Подтвердите email для FixNet CRM:',
    link,
    '',
    'Ссылка действует 24 часа. Если вы не запрашивали письмо, просто проигнорируйте его.',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
      <h2>Подтверждение email</h2>
      <p>Здравствуйте, ${esc(name || 'пользователь')}!</p>
      <p>Нажмите кнопку, чтобы подтвердить адрес для FixNet CRM.</p>
      <p style="margin:28px 0">
        <a href="${esc(link)}" style="background:#f5c400;color:#111827;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">
          Подтвердить email
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">Ссылка действует 24 часа. Если вы не запрашивали письмо, проигнорируйте его.</p>
    </div>`;
  await getTransport().sendMail({ from: c.from, to: email, subject, text, html });
}

async function verifyTransport() {
  if (!isConfigured()) return { configured: false, ok: false };
  try {
    await getTransport().verify();
    return { configured: true, ok: true };
  } catch (error) {
    return { configured: true, ok: false, error: error?.message || 'SMTP error' };
  }
}

module.exports = { config, isConfigured, sendVerificationEmail, verifyTransport };

