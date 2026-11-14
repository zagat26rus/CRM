const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);

function parseRoles(raw) {
  if (!raw || raw === 'all') return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ignore
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowMatchesRole(targetRoles, userRole) {
  const roles = parseRoles(targetRoles);
  if (!roles || roles.length === 0) return true;
  return roles.includes('all') || roles.includes(userRole);
}

function mapAnnouncement(row, userId) {
  const read = db
    .prepare('SELECT 1 FROM announcement_reads WHERE announcementId = ? AND userId = ?')
    .get(row.id, userId);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority || 'normal',
    targetRoles: row.targetRoles || 'all',
    pinned: Boolean(row.pinned),
    expiresAt: row.expiresAt || null,
    isActive: Boolean(row.isActive),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isRead: Boolean(read),
  };
}

router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.all === '1' && ['owner', 'admin', 'director'].includes(req.user.role);
    const now = getCurrentTime().slice(0, 10);
    const rows = db
      .prepare(
        `
        SELECT * FROM announcements
        WHERE companyId = ?
        ${includeInactive ? '' : 'AND isActive = 1'}
        ORDER BY pinned DESC, createdAt DESC
      `
      )
      .all(req.user.companyId);

    const items = rows
      .filter((row) => rowMatchesRole(row.targetRoles, req.user.role))
      .filter((row) => {
        if (includeInactive) return true;
        if (!row.expiresAt) return true;
        return String(row.expiresAt).slice(0, 10) >= now;
      })
      .map((row) => mapAnnouncement(row, req.user.id));

    const unread = items.filter((i) => !i.isRead).length;
    res.json({ announcements: items, unread });
  } catch (error) {
    console.error('Ошибка списка объявлений:', error);
    res.status(500).json({ error: 'Ошибка загрузки объявлений' });
  }
});

router.post('/', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { title, body, priority = 'normal', targetRoles = 'all', pinned = false, expiresAt = null, isActive = true } =
      req.body || {};
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (!String(body || '').trim()) return res.status(400).json({ error: 'Укажите текст объявления' });

    const now = getCurrentTime();
    const rolesValue = Array.isArray(targetRoles) ? JSON.stringify(targetRoles) : String(targetRoles || 'all');

    const result = db
      .prepare(
        `
        INSERT INTO announcements (
          companyId, title, body, priority, targetRoles, pinned, expiresAt, isActive, createdByUserId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        req.user.companyId,
        String(title).trim(),
        String(body).trim(),
        ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
        rolesValue,
        pinned ? 1 : 0,
        expiresAt ? String(expiresAt).slice(0, 10) : null,
        isActive ? 1 : 0,
        req.user.id,
        now,
        now
      );

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(mapAnnouncement(row, req.user.id));
  } catch (error) {
    console.error('Ошибка создания объявления:', error);
    res.status(500).json({ error: 'Ошибка создания объявления' });
  }
});

router.put('/:id', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db
      .prepare('SELECT * FROM announcements WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Объявление не найдено' });

    const fields = [];
    const params = [];
    const allowed = ['title', 'body', 'priority', 'targetRoles', 'pinned', 'expiresAt', 'isActive'];

    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      fields.push(`${key} = ?`);
      if (key === 'pinned' || key === 'isActive') params.push(req.body[key] ? 1 : 0);
      else if (key === 'targetRoles' && Array.isArray(req.body[key])) params.push(JSON.stringify(req.body[key]));
      else if (key === 'expiresAt') params.push(req.body[key] ? String(req.body[key]).slice(0, 10) : null);
      else params.push(req.body[key]);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Нет полей для обновления' });

    fields.push('updatedAt = ?');
    params.push(getCurrentTime(), id, req.user.companyId);
    db.prepare(`UPDATE announcements SET ${fields.join(', ')} WHERE id = ? AND companyId = ?`).run(...params);

    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.json(mapAnnouncement(row, req.user.id));
  } catch (error) {
    console.error('Ошибка обновления объявления:', error);
    res.status(500).json({ error: 'Ошибка обновления объявления' });
  }
});

router.delete('/:id', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM announcements WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    if (!result.changes) return res.status(404).json({ error: 'Объявление не найдено' });
    db.prepare('DELETE FROM announcement_reads WHERE announcementId = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления объявления:', error);
    res.status(500).json({ error: 'Ошибка удаления объявления' });
  }
});

router.post('/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ? AND companyId = ? AND isActive = 1')
      .get(id, req.user.companyId);
    if (!row) return res.status(404).json({ error: 'Объявление не найдено' });

    const now = getCurrentTime();
    db.prepare(
      `
      INSERT INTO announcement_reads (announcementId, userId, readAt)
      VALUES (?, ?, ?)
      ON CONFLICT(announcementId, userId) DO UPDATE SET readAt = excluded.readAt
    `
    ).run(id, req.user.id, now);

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка отметки прочтения:', error);
    res.status(500).json({ error: 'Ошибка отметки прочтения' });
  }
});

router.post('/read-all', (req, res) => {
  try {
    const now = getCurrentTime();
    const rows = db
      .prepare('SELECT id, targetRoles FROM announcements WHERE companyId = ? AND isActive = 1')
      .all(req.user.companyId);

    const insert = db.prepare(
      `
      INSERT INTO announcement_reads (announcementId, userId, readAt)
      VALUES (?, ?, ?)
      ON CONFLICT(announcementId, userId) DO UPDATE SET readAt = excluded.readAt
    `
    );

    const tx = db.transaction(() => {
      for (const row of rows) {
        if (!rowMatchesRole(row.targetRoles, req.user.role)) continue;
        insert.run(row.id, req.user.id, now);
      }
    });
    tx();
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка прочтения всех:', error);
    res.status(500).json({ error: 'Ошибка прочтения всех объявлений' });
  }
});

module.exports = router;
