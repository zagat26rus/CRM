const { cfg } = require('./config');

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

async function call(method, payload = {}, { timeoutMs = 12000 } = {}) {
  const c = cfg();
  if (!c.token) throw new TgError('Токен бота не задан', { network: true });
  const url = `${c.apiBase}/bot${c.token}/${method}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    downUntil = Date.now() + BREAKER_MS;
    lastError = `${method}: ${e?.cause?.code || e?.name || 'network error'}`;
    throw new TgError(lastError, { network: true });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    downUntil = Date.now() + BREAKER_MS;
    lastError = `${method}: bad response (${res.status})`;
    throw new TgError(lastError, { network: true, code: res.status });
  }
  downUntil = 0;
  lastOkAt = Date.now();
  lastError = '';
  if (!data.ok) throw new TgError(data.description || `Telegram error ${res.status}`, { code: data.error_code || res.status });
  return data.result;
}

async function downloadFile(filePath, { timeoutMs = 30000 } = {}) {
  const c = cfg();
  const url = `${c.apiBase}/file/bot${c.token}/${filePath}`;
  let res;
  try {
    res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    downUntil = Date.now() + BREAKER_MS;
    lastError = `file: ${e?.cause?.code || e?.name || 'network error'}`;
    throw new TgError(lastError, { network: true });
  }
  if (!res.ok) throw new TgError(`Не удалось скачать файл (${res.status})`, { code: res.status });
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { call, downloadFile, isUp, health, TgError };
