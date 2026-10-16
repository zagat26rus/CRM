const crypto = require('crypto');
const { db } = require('../config/database');
const { cfg } = require('./config');

class CrmError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CrmError';
    this.status = status;
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/**
 * Выполняет запрос к собственному API CRM от имени сотрудника: создаётся короткая сессия,
 * поэтому права, побочные эффекты (списание деталей, SMS, история) и проверки роли — те же, что в веб-интерфейсе.
 */
async function request(user, method, path, { json, form } = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(token);
  const now = new Date();
  db.prepare('INSERT INTO sessions (userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
    user.id,
    tokenHash,
    new Date(now.getTime() + 3 * 60 * 1000).toISOString(),
    now.toISOString()
  );
  try {
    const headers = { Authorization: `Bearer ${token}` };
    let body;
    if (form) {
      body = form;
    } else if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const res = await fetch(`${cfg().loopbackUrl}/api${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new CrmError(data?.error || `Ошибка CRM (${res.status})`, res.status);
    return data;
  } finally {
    db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
  }
}

module.exports = { request, CrmError };
