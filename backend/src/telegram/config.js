const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const file = path.join(__dirname, '..', '..', '.env');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile();

const DEFAULT_API_BASE = 'https://api.telegram.org';

function cfg() {
  const apiBase = String(process.env.TELEGRAM_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  const direct = apiBase === DEFAULT_API_BASE;
  const mode = String(process.env.TELEGRAM_MODE || '').trim().toLowerCase();
  return {
    direct,
    mode: mode === 'webhook' || mode === 'polling' ? mode : direct ? 'polling' : 'webhook',
    apiIps: String(process.env.TELEGRAM_API_IPS || '149.154.167.220,149.154.167.221,149.154.167.222,149.154.166.110')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    apiBase,
    relayKey: String(process.env.TELEGRAM_RELAY_KEY || '').trim(),
    webhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
    webhookUrl: String(process.env.TELEGRAM_WEBHOOK_URL || 'https://www.fedfix.ru/api/telegram/webhook').trim(),
    botUsername: String(process.env.TELEGRAM_BOT_USERNAME || 'fixnetcrm_bot').replace(/^@/, ''),
    timeZone: String(process.env.TELEGRAM_TZ || 'Europe/Moscow'),
    loopbackUrl: String(process.env.CRM_LOOPBACK_URL || `http://127.0.0.1:${process.env.PORT || 5000}`).replace(/\/+$/, ''),
  };
}

module.exports = { cfg };
