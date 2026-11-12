const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.get('/', requireAuth, requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const users = db
      .prepare(
        `
        SELECT id, companyId, name, email, phone, role, isActive, createdAt, updatedAt
        FROM users
        WHERE companyId = ?
        ORDER BY createdAt DESC, id DESC
      `
      )
      .all(req.user.companyId);

    res.json(users);
  } catch (e) {
    console.error('Ошибка получения пользователей:', e);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

router.put('/:id/role', requireAuth, requireRole(['owner', 'admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body || {};
    const r = String(role || '').trim();
    if (!['admin', 'director', 'master'].includes(r)) return res.status(400).json({ error: 'Некорректная роль' });

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.role === 'owner') return res.status(400).json({ error: 'Нельзя изменить роль владельца' });

    const now = getCurrentTime();
    db.prepare('UPDATE users SET role = ?, updatedAt = ? WHERE id = ?').run(r, now, id);
    const updated = db.prepare('SELECT id, companyId, name, email, phone, role, isActive, createdAt, updatedAt FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch (e) {
    console.error('Ошибка смены роли:', e);
    res.status(500).json({ error: 'Ошибка смены роли' });
  }
});

router.put('/:id/active', requireAuth, requireRole(['owner', 'admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const isActive = req.body?.isActive !== false;

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.role === 'owner') return res.status(400).json({ error: 'Нельзя заблокировать владельца' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'Нельзя изменить свой статус' });

    const now = getCurrentTime();
    db.prepare('UPDATE users SET isActive = ?, updatedAt = ? WHERE id = ?').run(isActive ? 1 : 0, now, id);

    if (!isActive) {
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(id);
    }

    const updated = db
      .prepare('SELECT id, companyId, name, email, phone, role, isActive, createdAt, updatedAt FROM users WHERE id = ?')
      .get(id);
    res.json(updated);
  } catch (e) {
    console.error('Ошибка смены статуса пользователя:', e);
    res.status(500).json({ error: 'Ошибка смены статуса пользователя' });
  }
});

module.exports = router;





