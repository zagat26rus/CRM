/**
 * Client SMS via Android SMS Gateway (SIM on shop phone)
 * or SMSC.ru (alphanumeric sender — HelloClient-style CIS provider).
 *
 * Deploy to: /var/www/black-crm/back/src/utils/smsService.js
 */
const axios = require('axios');

// Note: getCompanySettings is required lazily to avoid circular deps with companySettings.js

const DEFAULT_CLIENT_SMS = {
  enabled: false,
  provider: 'android_gateway', // android_gateway | smsc
  android: {
    baseUrl: 'https://api.sms-gate.app/3rdparty/v1',
    username: '',
    password: '',
  },
  smsc: {
    login: '',
    password: '',
    sender: '',
  },
  publicBaseUrl: 'https://www.fedfix.ru',
  onIntake: true,
  onReady: true,
  includeReviewOnReady: false,
  reviewUrl: '',
  templates: {
    intake:
      'Здравствуйте, {имя}! Приняли {устройство} в ремонт, заказ #{номер}. Отслеживание: {ссылка}. {компания}',
    ready:
      'Здравствуйте, {имя}! {устройство} готово к выдаче, заказ #{номер}. Подробнее: {ссылка}. {компания}',
    ready_review:
      'Здравствуйте, {имя}! {устройство} готово, заказ #{номер}. Отслеживание: {ссылка}. Будем благодарны за отзыв: {отзыв}. {компания}',
  },
};

function normalizeClientSms(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const android = src.android && typeof src.android === 'object' ? src.android : {};
  const smsc = src.smsc && typeof src.smsc === 'object' ? src.smsc : {};
  const templates = src.templates && typeof src.templates === 'object' ? src.templates : {};
  return {
    enabled: Boolean(src.enabled),
    provider: String(src.provider || DEFAULT_CLIENT_SMS.provider),
    android: {
      baseUrl: String(android.baseUrl || DEFAULT_CLIENT_SMS.android.baseUrl).replace(/\/$/, ''),
      username: String(android.username || ''),
      password: String(android.password || ''),
    },
    smsc: {
      login: String(smsc.login || ''),
      password: String(smsc.password || ''),
      sender: String(smsc.sender || ''),
    },
    publicBaseUrl: String(src.publicBaseUrl || DEFAULT_CLIENT_SMS.publicBaseUrl).replace(/\/$/, ''),
    onIntake: src.onIntake !== undefined ? Boolean(src.onIntake) : true,
    onReady: src.onReady !== undefined ? Boolean(src.onReady) : true,
    includeReviewOnReady: Boolean(src.includeReviewOnReady),
    reviewUrl: String(src.reviewUrl || ''),
    templates: {
      intake: String(templates.intake || DEFAULT_CLIENT_SMS.templates.intake),
      ready: String(templates.ready || DEFAULT_CLIENT_SMS.templates.ready),
      ready_review: String(templates.ready_review || DEFAULT_CLIENT_SMS.templates.ready_review),
    },
  };
}

/** Merge PATCH without wiping secrets when UI sends *** / empty. */
function mergeClientSmsPatch(currentRaw, patchRaw) {
  const current = normalizeClientSms(currentRaw);
  const patch = patchRaw && typeof patchRaw === 'object' ? patchRaw : {};
  const next = normalizeClientSms({
    ...current,
    ...patch,
    android: { ...current.android, ...(patch.android || {}) },
    smsc: { ...current.smsc, ...(patch.smsc || {}) },
    templates: { ...current.templates, ...(patch.templates || {}) },
  });

  const ap = patch.android || {};
  if (ap.password === undefined || ap.password === '' || ap.password === '***') {
    next.android.password = current.android.password;
  }
  if (ap.clearPassword) next.android.password = '';

  const sp = patch.smsc || {};
  if (sp.password === undefined || sp.password === '' || sp.password === '***') {
    next.smsc.password = current.smsc.password;
  }
  if (sp.clearPassword) next.smsc.password = '';

  return next;
}

function publicClientSms(cfg) {
  const n = normalizeClientSms(cfg);
  return {
    ...n,
    android: {
      ...n.android,
      password: n.android.password ? '***' : '',
      passwordSet: Boolean(n.android.password),
    },
    smsc: {
      ...n.smsc,
      password: n.smsc.password ? '***' : '',
      passwordSet: Boolean(n.smsc.password),
    },
  };
}

function normalizePhoneRu(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  if (d.length < 11) return '';
  return `+${d}`;
}

function buildTrackUrl(cfg, publicToken) {
  if (!publicToken) return '';
  return `${cfg.publicBaseUrl}/track/${publicToken}`;
}

function renderSmsTemplate(template, vars) {
  let text = String(template || '');
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'gi'), String(v ?? ''));
  }
  return text.replace(/\s+/g, ' ').trim();
}

async function sendViaAndroidGateway(cfg, phoneE164, text) {
  const { baseUrl, username, password } = cfg.android;
  if (!username || !password) throw new Error('Не заданы логин/пароль Android SMS Gateway');
  const url = `${baseUrl}/messages`;
  const res = await axios.post(
    url,
    { textMessage: { text }, phoneNumbers: [phoneE164] },
    {
      timeout: 20000,
      auth: { username, password },
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    },
  );
  if (res.status >= 400) {
    const detail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
    throw new Error(`Android Gateway HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { provider: 'android_gateway', id: res.data?.id || null, raw: res.data };
}

async function sendViaSmsc(cfg, phoneE164, text) {
  const { login, password, sender } = cfg.smsc;
  if (!login || !password) throw new Error('Не заданы login/password SMSC.ru');
  const params = {
    login,
    psw: password,
    phones: phoneE164.replace('+', ''),
    mes: text,
    fmt: 3,
    charset: 'utf-8',
  };
  if (sender) params.sender = sender;
  const res = await axios.get('https://smsc.ru/sys/send.php', {
    params,
    timeout: 20000,
    validateStatus: () => true,
  });
  const data = res.data;
  if (data?.error || data?.error_code) {
    throw new Error(`SMSC: ${data.error || data.error_code}`);
  }
  return { provider: 'smsc', id: data?.id || null, raw: data };
}

async function sendSms(db, companyId, { phone, text }) {
  const { getCompanySettings } = require('./companySettings');
  const settings = getCompanySettings(db, companyId);
  const cfg = normalizeClientSms(settings.clientSms);
  if (!cfg.enabled) return { ok: false, skipped: true, reason: 'disabled' };
  const phoneE164 = normalizePhoneRu(phone);
  if (!phoneE164) return { ok: false, error: 'bad_phone' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'empty_text' };

  try {
    const result =
      cfg.provider === 'smsc'
        ? await sendViaSmsc(cfg, phoneE164, body)
        : await sendViaAndroidGateway(cfg, phoneE164, body);
    return { ok: true, ...result };
  } catch (e) {
    console.error('sms send failed', e.message || e);
    return { ok: false, error: e.message || 'send_failed' };
  }
}

function orderSmsVars(cfg, order, companyName) {
  const firstName = String(order.client || 'Клиент').split(/\s+/)[0];
  const device = [order.brand, order.model].filter(Boolean).join(' ') || 'устройство';
  const link = buildTrackUrl(cfg, order.publicToken);
  return {
    имя: firstName,
    клиент: order.client || 'Клиент',
    номер: order.documentNumber || order.id || '—',
    устройство: device,
    статус: order.status || '',
    компания: companyName || 'FixNet',
    телефон: order.phone || '',
    ссылка: link,
    отзыв: cfg.reviewUrl || '',
  };
}

async function maybeSendOrderSms(db, companyId, order, event) {
  const { getCompanySettings } = require('./companySettings');
  const settings = getCompanySettings(db, companyId);
  const cfg = normalizeClientSms(settings.clientSms);
  if (!cfg.enabled) return { ok: false, skipped: true, reason: 'disabled' };

  if (event === 'intake' && !cfg.onIntake) return { ok: false, skipped: true, reason: 'intake_off' };
  if (event === 'ready' && !cfg.onReady) return { ok: false, skipped: true, reason: 'ready_off' };

  let companyName = 'FixNet';
  try {
    const row = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
    if (row?.name) companyName = row.name;
  } catch {
    /* ignore */
  }

  const vars = orderSmsVars(cfg, order, companyName);
  let template = cfg.templates.intake;
  if (event === 'ready') {
    template =
      cfg.includeReviewOnReady && cfg.reviewUrl
        ? cfg.templates.ready_review
        : cfg.templates.ready;
  }
  const text = renderSmsTemplate(template, vars);
  const result = await sendSms(db, companyId, { phone: order.phone, text });
  return { ...result, text, event };
}

function isReadyStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'готово' || s === 'готов';
}

module.exports = {
  DEFAULT_CLIENT_SMS,
  normalizeClientSms,
  mergeClientSmsPatch,
  publicClientSms,
  sendSms,
  maybeSendOrderSms,
  isReadyStatus,
  buildTrackUrl,
  renderSmsTemplate,
  normalizePhoneRu,
};
