const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, sha256 } = require('../middlewares/auth');
const { seedCompanyDictionaries } = require('../utils/seedData');
const emailService = require('../utils/emailService');

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

function createEmailVerificationToken(userId) {
  const token = base64url(crypto.randomBytes(32));
  const tokenHash = sha256(token);
  const now = getCurrentTime();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM email_verification_tokens WHERE userId = ? AND usedAt IS NULL').run(userId);
  db.prepare(
    'INSERT INTO email_verification_tokens (userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)'
  ).run(userId, tokenHash, expiresAt, now);
  return { token, expiresAt };
}

async function sendVerificationForUser(user) {
  const verification = createEmailVerificationToken(user.id);
  await emailService.sendVerificationEmail({
    email: user.email,
    name: user.name,
    token: verification.token,
  });
  const now = getCurrentTime();
  db.prepare('UPDATE users SET emailVerificationSentAt = ?, updatedAt = ? WHERE id = ?').run(now, now, user.id);
  return { expiresAt: verification.expiresAt, sentAt: now };
}

function safeUserRow(u) {
  return {
    id: u.id,
    companyId: u.companyId,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: Boolean(u.emailVerifiedAt),
    emailVerifiedAt: u.emailVerifiedAt || null,
    emailVerificationRequired: Boolean(u.emailVerificationRequired),
  };
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
router.post('/register', async (req, res) => {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 255) {
      return res.status(400).json({ error: 'Некорректный формат email' });
    }
    if (p.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(e);
    if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });

    const verificationRequired = emailService.isConfigured();
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
          INSERT INTO users (
            companyId, name, email, phone, role, passwordSalt, passwordHash, isActive,
            emailVerificationRequired, createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, 'owner', ?, ?, 1, ?, ?, ?)
        `
        )
        .run(
          companyId,
          n,
          e,
          String(req.body?.phone || ''),
          salt,
          hash,
          verificationRequired ? 1 : 0,
          now,
          now
        );

      return { companyId, userId: userResult.lastInsertRowid };
    });

    const created = tx();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(created.userId);
    const comp = db.prepare('SELECT * FROM companies WHERE id = ?').get(created.companyId);
    if (verificationRequired) {
      try {
        await sendVerificationForUser(user);
      } catch (mailError) {
        console.error('Ошибка отправки подтверждения email:', mailError?.message || mailError);
        return res.status(503).json({
          error: 'Аккаунт создан, но письмо не отправлено. Повторите отправку на странице входа.',
          verificationRequired: true,
          mailSent: false,
          email: user.email,
        });
      }
      return res.status(201).json({
        verificationRequired: true,
        mailSent: true,
        email: user.email,
        user: safeUserRow(user),
        company: { id: comp.id, name: comp.name },
      });
    }

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
    if (user.emailVerificationRequired && !user.emailVerifiedAt) {
      return res.status(403).json({
        error: 'Сначала подтвердите email. Мы отправили ссылку на вашу почту.',
        code: 'email_verification_required',
        email: user.email,
      });
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

router.get('/email-verification/status', requireAuth, (req, res) => {
  const user = db
    .prepare(
      `SELECT id, email, emailVerifiedAt, emailVerificationRequired, emailVerificationSentAt
       FROM users WHERE id = ?`
    )
    .get(req.user.id);
  res.json({
    configured: emailService.isConfigured(),
    email: user?.email || req.user.email,
    verified: Boolean(user?.emailVerifiedAt),
    verifiedAt: user?.emailVerifiedAt || null,
    required: Boolean(user?.emailVerificationRequired),
    sentAt: user?.emailVerificationSentAt || null,
  });
});

router.post('/email-verification/request', requireAuth, async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({ error: 'Отправка почты пока не настроена администратором' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const lastSent = user.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
    if (lastSent && Date.now() - lastSent < 60_000) {
      return res.status(429).json({ error: 'Письмо уже отправлено. Подождите минуту.' });
    }
    const result = await sendVerificationForUser(user);
    res.json({ ok: true, expiresAt: result.expiresAt });
  } catch (error) {
    console.error('Ошибка запроса подтверждения email:', error?.message || error);
    res.status(502).json({ error: 'Не удалось отправить письмо. Проверьте почтовые настройки.' });
  }
});

router.post('/email-verification/resend', async (req, res) => {
  const generic = { ok: true, message: 'Если адрес зарегистрирован, письмо будет отправлено.' };
  try {
    if (!emailService.isConfigured()) return res.status(503).json({ error: 'Отправка почты пока не настроена' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.json(generic);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || user.emailVerifiedAt) return res.json(generic);
    const lastSent = user.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
    if (!lastSent || Date.now() - lastSent >= 60_000) await sendVerificationForUser(user);
    return res.json(generic);
  } catch (error) {
    console.error('Ошибка повторной отправки подтверждения:', error?.message || error);
    return res.json(generic);
  }
});

router.post('/email-verification/verify', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token.length < 32 || token.length > 200) {
      return res.status(400).json({ error: 'Некорректная ссылка подтверждения' });
    }
    const tokenHash = sha256(token);
    const row = db
      .prepare(
        `SELECT t.id AS tokenId, t.userId, t.expiresAt, u.*
         FROM email_verification_tokens t
         JOIN users u ON u.id = t.userId
         WHERE t.tokenHash = ? AND t.usedAt IS NULL
         LIMIT 1`
      )
      .get(tokenHash);
    if (!row || new Date(row.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
    }
    const now = getCurrentTime();
    const tx = db.transaction(() => {
      db.prepare('UPDATE email_verification_tokens SET usedAt = ? WHERE id = ?').run(now, row.tokenId);
      db.prepare(
        'UPDATE users SET emailVerifiedAt = ?, emailVerificationRequired = 0, updatedAt = ? WHERE id = ?'
      ).run(now, now, row.userId);
    });
    tx();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.userId);
    const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(user.companyId);
    const session = createSession(user.id);
    res.json({
      ok: true,
      token: session.token,
      user: safeUserRow(user),
      company,
    });
  } catch (error) {
    console.error('Ошибка подтверждения email:', error);
    res.status(500).json({ error: 'Не удалось подтвердить email' });
  }
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
    const user = db
      .prepare(
        `SELECT id, companyId, name, email, role, emailVerifiedAt, emailVerificationRequired
         FROM users WHERE id = ?`
      )
      .get(req.user.id);
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
    db.prepare('DELETE FROM password_reset_tokens WHERE userId = ? AND usedAt IS NULL').run(req.user.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Ошибка смены пароля:', e);
    res.status(500).json({ error: 'Ошибка смены пароля' });
  }
});

const RESET_GENERIC = {
  ok: true,
  message: 'Если этот адрес зарегистрирован, мы отправили на него ссылку для нового пароля.',
};

router.post('/password-reset/request', async (req, res) => {
  try {
    if (!emailService.isConfigured()) {
      return res.status(503).json({ error: 'Отправка почты пока не настроена' });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return res.status(400).json({ error: 'Введите корректный email' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.isActive) return res.json(RESET_GENERIC);

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = db
      .prepare(
        `SELECT COUNT(*) AS count, MAX(createdAt) AS lastAt
         FROM password_reset_tokens WHERE userId = ? AND createdAt >= ?`
      )
      .get(user.id, hourAgo);
    const lastMs = recent?.lastAt ? new Date(recent.lastAt).getTime() : 0;
    if ((Number(recent?.count) || 0) >= 5 || (lastMs && Date.now() - lastMs < 60_000)) {
      return res.json(RESET_GENERIC);
    }

    const token = base64url(crypto.randomBytes(32));
    const tokenHash = sha256(token);
    const now = getCurrentTime();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM password_reset_tokens WHERE userId = ? AND usedAt IS NULL').run(user.id);
    db.prepare(
      'INSERT INTO password_reset_tokens (userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)'
    ).run(user.id, tokenHash, expiresAt, now);
    try {
      await emailService.sendPasswordResetEmail({ email: user.email, name: user.name, token });
    } catch (mailError) {
      db.prepare('DELETE FROM password_reset_tokens WHERE tokenHash = ?').run(tokenHash);
      console.error('Ошибка отправки письма для сброса пароля:', mailError?.message || mailError);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте ещё раз через минуту.' });
    }
    return res.json(RESET_GENERIC);
  } catch (error) {
    console.error('Ошибка запроса сброса пароля:', error?.message || error);
    return res.status(500).json({ error: 'Не удалось подготовить сброс пароля' });
  }
});

router.post('/password-reset/confirm', (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (token.length < 32 || token.length > 200) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
    }
    if (password.length < 6 || password.length > 200) {
      return res.status(400).json({ error: 'Пароль должен быть от 6 до 200 символов' });
    }
    const tokenHash = sha256(token);
    const row = db
      .prepare(
        `SELECT t.id AS tokenId, t.userId, t.expiresAt, t.usedAt, u.isActive
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.userId
         WHERE t.tokenHash = ?`
      )
      .get(tokenHash);
    if (!row || row.usedAt || !row.isActive || new Date(row.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'Ссылка недействительна или истекла. Запросите новую на странице входа.',
      });
    }

    const { salt, hash } = createPasswordHash(password);
    const now = getCurrentTime();
    const apply = db.transaction(() => {
      db.prepare(
        `UPDATE users
         SET passwordSalt = ?, passwordHash = ?, emailVerifiedAt = COALESCE(emailVerifiedAt, ?),
             emailVerificationRequired = 0, updatedAt = ?
         WHERE id = ?`
      ).run(salt, hash, now, now, row.userId);
      db.prepare('UPDATE password_reset_tokens SET usedAt = ? WHERE id = ?').run(now, row.tokenId);
      db.prepare('DELETE FROM password_reset_tokens WHERE userId = ? AND usedAt IS NULL').run(row.userId);
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(row.userId);
    });
    apply();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.userId);
    const comp = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.companyId);
    const session = createSession(user.id);
    res.json({
      token: session.token,
      user: safeUserRow(user),
      company: comp ? { id: comp.id, name: comp.name } : null,
    });
  } catch (error) {
    console.error('Ошибка сброса пароля:', error?.message || error);
    res.status(500).json({ error: 'Не удалось сменить пароль' });
  }
});

module.exports = router;


