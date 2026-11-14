const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole, sha256 } = require('../middlewares/auth');

function publicBaseUrl(req) {
  const configured = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s/]+$/i.test(origin)) return origin;
  return 'http://localhost:5173';
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createInviteToken() {
  const token = base64url(crypto.randomBytes(24));
  return token;
}

function safeInvite(i) {
  return {
    id: i.id,
    companyId: i.companyId,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt,
    usedAt: i.usedAt
  };
}

// List invites for company
router.get('/', requireAuth, requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const invites = db
      .prepare(
        `
        SELECT i.*, u.email as createdByEmail
        FROM invites i
        LEFT JOIN users u ON u.id = i.createdByUserId
        WHERE i.companyId = ?
        ORDER BY i.createdAt DESC, i.id DESC
        LIMIT 200
      `
      )
      .all(req.user.companyId);

    res.json(invites.map(safeInvite));
  } catch (e) {
    console.error('Ошибка получения приглашений:', e);
    res.status(500).json({ error: 'Ошибка получения приглашений' });
  }
});

// Generate (rotate) link for an existing invite (token is stored as hash, so we return a fresh token)
router.post('/:id/link', requireAuth, requireRole(['owner', 'admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const invite = db.prepare('SELECT * FROM invites WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (invite.usedAt) return res.status(400).json({ error: 'Приглашение уже использовано' });
    const exp = new Date(invite.expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) return res.status(400).json({ error: 'Приглашение истекло' });

    const token = createInviteToken();
    const tokenHash = sha256(token);

    db.prepare('UPDATE invites SET tokenHash = ? WHERE id = ?').run(tokenHash, id);

    res.json({
      token,
      url: `${publicBaseUrl(req)}/invite/${token}`,
      expiresAt: invite.expiresAt
    });
  } catch (e) {
    console.error('Ошибка генерации ссылки приглашения:', e);
    res.status(500).json({ error: 'Ошибка генерации ссылки приглашения' });
  }
});

// Revoke invite (if not used)
router.delete('/:id', requireAuth, requireRole(['owner', 'admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const invite = db.prepare('SELECT * FROM invites WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (invite.usedAt) return res.status(400).json({ error: 'Нельзя отозвать использованное приглашение' });

    db.prepare('DELETE FROM invites WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка отзыва приглашения:', e);
    res.status(500).json({ error: 'Ошибка отзыва приглашения' });
  }
});

router.post('/', requireAuth, requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { email = null, role = 'master', expiresInDays = 7 } = req.body || {};
    const r = String(role || '').trim();
    if (!['admin', 'director', 'master'].includes(r)) return res.status(400).json({ error: 'Некорректная роль' });

    const token = createInviteToken();
    const tokenHash = sha256(token);
    const now = getCurrentTime();
    const days = Math.max(1, Math.min(30, Number(expiresInDays) || 7));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO invites (companyId, email, role, tokenHash, expiresAt, createdByUserId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.companyId,
      email ? String(email).trim().toLowerCase() : null,
      r,
      tokenHash,
      expiresAt,
      req.user.id,
      now
    );

    res.status(201).json({
      token,
      url: `${publicBaseUrl(req)}/invite/${token}`,
      expiresAt
    });
  } catch (e) {
    console.error('Ошибка создания приглашения:', e);
    res.status(500).json({ error: 'Ошибка создания приглашения' });
  }
});

router.get('/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Некорректный токен' });

    const tokenHash = sha256(token);
    const invite = db.prepare(`
      SELECT i.*, c.name as companyName
      FROM invites i
      JOIN companies c ON c.id = i.companyId
      WHERE i.tokenHash = ?
      LIMIT 1
    `).get(tokenHash);

    if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (invite.usedAt) return res.status(400).json({ error: 'Приглашение уже использовано' });
    const exp = new Date(invite.expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) return res.status(400).json({ error: 'Приглашение истекло' });

    res.json({
      invite: safeInvite(invite),
      company: { id: invite.companyId, name: invite.companyName }
    });
  } catch (e) {
    console.error('Ошибка проверки приглашения:', e);
    res.status(500).json({ error: 'Ошибка проверки приглашения' });
  }
});

// Accept invite -> create user + session
router.post('/:token/accept', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const { name, email, password } = req.body || {};
    const n = String(name || '').trim();
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '');

    if (!token) return res.status(400).json({ error: 'Некорректный токен' });
    if (!n || !e || !p) return res.status(400).json({ error: 'Заполните обязательные поля' });
    if (p.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });

    const tokenHash = sha256(token);
    const invite = db.prepare('SELECT * FROM invites WHERE tokenHash = ?').get(tokenHash);
    if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });
    if (invite.usedAt) return res.status(400).json({ error: 'Приглашение уже использовано' });
    const exp = new Date(invite.expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) return res.status(400).json({ error: 'Приглашение истекло' });
    if (invite.email && String(invite.email).toLowerCase() !== e) return res.status(400).json({ error: 'Email не совпадает с приглашением' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(e);
    if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });

    const now = getCurrentTime();
    const pbkdf2 = require('crypto').pbkdf2Sync;
    const salt = base64url(require('crypto').randomBytes(16));

    const passHash = pbkdf2(p, salt, 120000, 32, 'sha256').toString('hex');

    const tx = db.transaction(() => {
      const userRes = db.prepare(`
        INSERT INTO users (companyId, name, email, phone, role, passwordSalt, passwordHash, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(invite.companyId, n, e, '', invite.role, salt, passHash, now, now);

      const userId = userRes.lastInsertRowid;
      db.prepare('UPDATE invites SET usedByUserId = ?, usedAt = ? WHERE id = ?').run(userId, now, invite.id);
      return userId;
    });

    const userId = tx();

    const sessionToken = base64url(crypto.randomBytes(32));
    const sessionHash = sha256(sessionToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    db.prepare('INSERT INTO sessions (userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
      userId,
      sessionHash,
      expiresAt,
      now
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const comp = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.companyId);

    res.status(201).json({
      token: sessionToken,
      user: { id: user.id, companyId: user.companyId, name: user.name, email: user.email, role: user.role },
      company: { id: comp.id, name: comp.name }
    });
  } catch (e) {
    console.error('Ошибка принятия приглашения:', e);
    res.status(500).json({ error: 'Ошибка принятия приглашения' });
  }
});

module.exports = router;


