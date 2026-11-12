const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, sha256 } = require('../middlewares/auth');
const { seedCompanyDictionaries } = require('../utils/seedData');

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPasswordHash(password, salt) {
  const s = salt || base64url(crypto.randomBytes(16));
  const hash = crypto.pbkdf2Sync(String(password), s, 120000, 32, 'sha256').toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.pbkdf2Sync(String(password), String(salt), 120000, 32, 'sha256').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(String(expectedHash), 'hex'));
  } catch {
    return false;
  }
}

function createSession(userId) {
  const token = base64url(crypto.randomBytes(32));
  const tokenHash = sha256(token);
  const now = getCurrentTime();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(); // 1 year
  db.prepare('INSERT INTO sessions (userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt,
    now
  );
  return { token, expiresAt };
}

function safeUserRow(u) {
  return { id: u.id, companyId: u.companyId, name: u.name, email: u.email, role: u.role };
}

function seedDefaultPaymentCategories(companyId) {
  const count = db
    .prepare('SELECT COUNT(*) as count FROM categories WHERE companyId = ?')
    .get(companyId)?.count;
  if (count && Number(count) > 0) return;

  const now = getCurrentTime();
  const cats = [
    // income
    [companyId, 'Оплата услуг', 'income', 'Оплата за услуги ремонта', '#10b981', '', 1, 1, now, now],
    [companyId, 'Аванс', 'income', 'Предоплата за работу', '#3b82f6', '', 1, 0, now, now],
    // expense
    [companyId, 'Зарплата', 'expense', 'Выплата зарплаты сотрудникам', '#ef4444', '', 1, 0, now, now],
    [companyId, 'Запчасти', 'expense', 'Покупка комплектующих', '#6366f1', '', 1, 1, now, now]
  ];

  const stmt = db.prepare(`
    INSERT INTO categories (companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) stmt.run(...r);
  });
  tx(cats);
}

// Register first account (owner) + company
router.post('/register', (req, res) => {
  try {
    const { email, password, name, company } = req.body || {};
    const e = String(email || '').trim().toLowerCase();
    const n = String(name || '').trim();
    const p = String(password || '');
    const c = company || {};
    const companyName = String(c.name || '').trim();

    if (!e || !p || !n || !companyName) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }
    if (p.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(e);
    if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });

    const now = getCurrentTime();
    const tx = db.transaction(() => {
      const companiesBefore = db.prepare('SELECT COUNT(*) as count FROM companies').get()?.count || 0;

      const companyResult = db
        .prepare('INSERT INTO companies (name, inn, city, address, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(
          companyName,
          c.inn ? String(c.inn).trim() : null,
          String(c.city || ''),
          String(c.address || ''),
          now,
          now
        );

      const companyId = companyResult.lastInsertRowid;

      // If this is the very first company in DB (legacy single-tenant data),
      // attach all existing rows that still have companyId = NULL to this new company.
      if (Number(companiesBefore) === 0) {
        const tables = [
          'orders',
          'payments',
          'tasks',
          'clients',
          'categories',
          'inventory_items',
          'inventory_sales',
          'inventory_receipts',
          'inventory_suppliers',
          'inventory_categories'
        ];
        for (const t of tables) {
          try {
            db.prepare(`UPDATE ${t} SET companyId = ? WHERE companyId IS NULL`).run(companyId);
          } catch {
            // ignore if table doesn't exist in older DBs
          }
        }
      }

      seedDefaultPaymentCategories(companyId);
      seedCompanyDictionaries(db, companyId);

      const { salt, hash } = createPasswordHash(p);
      const userResult = db
        .prepare(
          `
          INSERT INTO users (companyId, name, email, phone, role, passwordSalt, passwordHash, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'owner', ?, ?, 1, ?, ?)
        `
        )
        .run(companyId, n, e, String(req.body?.phone || ''), salt, hash, now, now);

      return { companyId, userId: userResult.lastInsertRowid };
    });

    const created = tx();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(created.userId);
    const comp = db.prepare('SELECT * FROM companies WHERE id = ?').get(created.companyId);
    const session = createSession(created.userId);

    res.status(201).json({
      token: session.token,
      user: safeUserRow(user),
      company: { id: comp.id, name: comp.name }
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Rate limiting для логина
const loginAttempts = new Map();
function checkLoginRateLimit(identifier, maxAttempts = 5, windowMs = 900000) { // 5 попыток за 15 минут
  const now = Date.now();
  const key = `login:${identifier}`;
  const record = loginAttempts.get(key);
  
  if (!record || now - record.firstAttempt > windowMs) {
    loginAttempts.set(key, { firstAttempt: now, count: 1, lastAttempt: now });
    return true;
  }
  
  if (record.count >= maxAttempts) {
    return false;
  }
  
  record.count++;
  record.lastAttempt = now;
  return true;
}

// Очистка старых записей
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now - record.firstAttempt > 900000) {
      loginAttempts.delete(key);
    }
  }
}, 600000);

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '');
    if (!e || !p) return res.status(400).json({ error: 'Введите email и пароль' });

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(e)) {
      return res.status(400).json({ error: 'Некорректный формат email' });
    }
    
    // Ограничиваем длину email
    if (e.length > 255) {
      return res.status(400).json({ error: 'Email слишком длинный' });
    }

    // Rate limiting: проверяем по email и IP
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (!checkLoginRateLimit(e, 5, 900000) || !checkLoginRateLimit(ip, 10, 900000)) {
      return res.status(429).json({ 
        error: 'Слишком много попыток входа. Попробуйте через 15 минут.' 
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(e);
    if (!user) {
      // Не раскрываем, существует ли пользователь (защита от перебора)
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    if (!user.isActive) return res.status(403).json({ error: 'Пользователь заблокирован' });

    const ok = verifyPassword(p, user.passwordSalt, user.passwordHash);
    if (!ok) {
      // Не раскрываем, правильный ли email (защита от перебора)
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    // Сбрасываем счетчик при успешном входе
    loginAttempts.delete(`login:${e}`);
    loginAttempts.delete(`login:${ip}`);

    const comp = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.companyId);
    const session = createSession(user.id);

    res.json({
      token: session.token,
      user: safeUserRow(user),
      company: { id: comp.id, name: comp.name }
    });
  } catch (error) {
    console.error('Ошибка логина:', error);
    res.status(500).json({ error: 'Ошибка логина' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, company: req.company });
});

router.post('/logout', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка выхода' });
  }
});

router.put('/profile', requireAuth, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Введите имя' });

    const now = getCurrentTime();
    db.prepare('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?').run(name, now, req.user.id);
    const user = db.prepare('SELECT id, companyId, name, email, role FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: safeUserRow(user) });
  } catch (e) {
    console.error('Ошибка обновления профиля:', e);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

router.put('/password', requireAuth, (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Введите текущий и новый пароль' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const ok = verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });

    const { salt, hash } = createPasswordHash(newPassword);
    const now = getCurrentTime();
    db.prepare('UPDATE users SET passwordSalt = ?, passwordHash = ?, updatedAt = ? WHERE id = ?').run(
      salt,
      hash,
      now,
      req.user.id
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка смены пароля:', e);
    res.status(500).json({ error: 'Ошибка смены пароля' });
  }
});

module.exports = router;


