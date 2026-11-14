const crypto = require('crypto');
const { db } = require('../config/database');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Не авторизован' });

    const tokenHash = sha256(token);
    const session = db
      .prepare(
        `
        SELECT s.*, u.id as userId, u.companyId, u.email, u.name, u.role, u.isActive,
               u.emailVerifiedAt, u.emailVerificationRequired,
               c.id as companyId2, c.name as companyName
        FROM sessions s
        JOIN users u ON u.id = s.userId
        JOIN companies c ON c.id = u.companyId
        WHERE s.tokenHash = ?
        LIMIT 1
      `
      )
      .get(tokenHash);

    if (!session) return res.status(401).json({ error: 'Сессия не найдена' });
    if (!session.isActive) return res.status(403).json({ error: 'Пользователь заблокирован' });

    const now = new Date();
    const exp = new Date(session.expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= now) {
      // best-effort cleanup
      try {
        db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
      } catch {}
      return res.status(401).json({ error: 'Сессия истекла' });
    }

    req.user = {
      id: session.userId,
      companyId: session.companyId,
      email: session.email,
      name: session.name,
      role: session.role,
      emailVerified: Boolean(session.emailVerifiedAt),
      emailVerifiedAt: session.emailVerifiedAt || null,
      emailVerificationRequired: Boolean(session.emailVerificationRequired)
    };

    req.company = {
      id: session.companyId,
      name: session.companyName
    };

    req.session = {
      id: session.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    };

    next();
  } catch (e) {
    console.error('Auth middleware error:', e);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}

module.exports = { requireAuth, requireRole, sha256 };





