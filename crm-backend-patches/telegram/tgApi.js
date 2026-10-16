const { cfg } = require('./config');
const { createDirectTransport } = require('./directTransport');

let direct = null;
function directTransport() {
  if (!direct) direct = createDirectTransport(cfg().apiIps);
  return direct;
}

const RETRIABLE_RESET = new Set(['ECONNRESET', 'EPIPE']);

async function directSend(path, opts) {
  try {
    return await directTransport().request(path, opts);
  } catch (e) {
    if (!RETRIABLE_RESET.has(e.code)) throw e;
    return directTransport().request(path, opts);
  }
}

class TgError extends Error {
  constructor(message, { code = 0, network = false } = {}) {
    super(message);
    this.name = 'TgError';
    this.code = code;
    this.network = network;
  }
}

const BREAKER_MS = 45 * 1000;
let downUntil = 0;
let lastOkAt = 0;
let lastError = '';

function isUp() {
  return Date.now() >= downUntil;
}

function health() {
  return { up: isUp(), lastOkAt, lastError, downUntil };
}

function headers(extra = {}) {
  const { relayKey } = cfg();
  return relayKey ? { 'x-relay-key': relayKey, ...extra } : extra;
}

function fail(label, e) {
  const c = cfg();
  if (!c.direct) downUntil = Date.now() + BREAKER_MS;
  lastError = `${label}: ${e?.cause?.code || e?.code || e?.name || 'network error'}`;
  return new TgError(lastError, { network: true });
}

async function call(method, payload = {}, { timeoutMs = 30000 } = {}) {
  const c = cfg();
  if (!c.token) throw new TgError('Токен бота не задан', { network: true });
  const body = JSON.stringify(payload);
  let status;
  let text;
  try {
    if (c.direct) {
      const r = await directSend(`/bot${c.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        body,
        timeoutMs,
      });
      status = r.status;
      text = r.body.toString('utf8');
    } else {
      const res = await fetch(`${c.apiBase}/bot${c.token}/${method}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      text = await res.text();
    }
  } catch (e) {
    throw fail(method, e);
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    if (!c.direct) downUntil = Date.now() + BREAKER_MS;
    lastError = `${method}: bad response (${status})`;
    throw new TgError(lastError, { network: true, code: status });
  }
  downUntil = 0;
  lastOkAt = Date.now();
  lastError = '';
  if (!data.ok) throw new TgError(data.description || `Telegram error ${status}`, { code: data.error_code || status });
  return data.result;
}

async function downloadFile(filePath, { timeoutMs = 60000 } = {}) {
  const c = cfg();
  let status;
  let buf;
  try {
    if (c.direct) {
      const r = await directSend(`/file/bot${c.token}/${filePath}`, { method: 'GET', timeoutMs });
      status = r.status;
      buf = r.body;
    } else {
      const res = await fetch(`${c.apiBase}/file/bot${c.token}/${filePath}`, {
        headers: headers(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      buf = Buffer.from(await res.arrayBuffer());
    }
  } catch (e) {
    throw fail('file', e);
  }
  if (status < 200 || status >= 300) throw new TgError(`Не удалось скачать файл (${status})`, { code: status });
  return buf;
}

module.exports = { call, downloadFile, isUp, health, TgError };
