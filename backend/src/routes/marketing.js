const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);

const SEGMENTS = [
  { id: 'all', label: 'Все клиенты', description: 'Полная клиентская база' },
  { id: 'inactive_30', label: 'Не были 30+ дней', description: 'Для возврата клиентов' },
  { id: 'inactive_90', label: 'Не были 90+ дней', description: 'Давно не обращались' },
  { id: 'vip', label: 'VIP (от 10 000 ₽)', description: 'Клиенты с высоким LTV' },
  { id: 'new', label: 'Новые (1 визит)', description: 'Первичные клиенты' },
  { id: 'repeat', label: 'Постоянные (2+ визита)', description: 'Повторные обращения' },
  { id: 'telegram', label: 'Есть Telegram', description: 'Можно написать в Telegram' },
  { id: 'whatsapp', label: 'Есть WhatsApp', description: 'Можно написать в WhatsApp' },
];

function daysAgoKey(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function clientsForSegment(companyId, segmentId) {
  const all = db
    .prepare(
      `
      SELECT id, name, phone, email, telegram, whatsapp, vk, totalOrders, totalSpent, lastOrderDate, notes
      FROM clients
      WHERE companyId = ?
      ORDER BY name COLLATE NOCASE ASC
    `
    )
    .all(companyId);

  const cutoff30 = daysAgoKey(30);
  const cutoff90 = daysAgoKey(90);

  return all.filter((c) => {
    const last = c.lastOrderDate ? String(c.lastOrderDate).slice(0, 10) : null;
    switch (segmentId) {
      case 'all':
        return true;
      case 'inactive_30':
        return !last || last < cutoff30;
      case 'inactive_90':
        return !last || last < cutoff90;
      case 'vip':
        return Number(c.totalSpent) >= 10000;
      case 'new':
        return Number(c.totalOrders) <= 1;
      case 'repeat':
        return Number(c.totalOrders) > 1;
      case 'telegram':
        return Boolean(String(c.telegram || '').trim());
      case 'whatsapp':
        return Boolean(String(c.whatsapp || '').trim());
      default:
        return false;
    }
  });
}

router.get('/segments', (req, res) => {
  try {
    const segments = SEGMENTS.map((s) => ({
      ...s,
      count: clientsForSegment(req.user.companyId, s.id).length,
    }));
    res.json({ segments });
  } catch (error) {
    console.error('Ошибка сегментов:', error);
    res.status(500).json({ error: 'Ошибка загрузки сегментов' });
  }
});

router.get('/segments/:segmentId/clients', (req, res) => {
  try {
    const { segmentId } = req.params;
    if (!SEGMENTS.some((s) => s.id === segmentId)) {
      return res.status(400).json({ error: 'Неизвестный сегмент' });
    }
    const clients = clientsForSegment(req.user.companyId, segmentId);
    res.json({ clients, total: clients.length });
  } catch (error) {
    console.error('Ошибка клиентов сегмента:', error);
    res.status(500).json({ error: 'Ошибка загрузки клиентов' });
  }
});

router.get('/campaigns', (req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT c.*, u.name as createdByName
        FROM marketing_campaigns c
        LEFT JOIN users u ON u.id = c.createdByUserId
        WHERE c.companyId = ?
        ORDER BY c.createdAt DESC
        LIMIT 100
      `
      )
      .all(req.user.companyId);
    res.json({
      campaigns: rows.map((r) => ({
        id: r.id,
        name: r.name,
        channel: r.channel,
        segment: r.segment,
        message: r.message,
        status: r.status,
        recipientCount: Number(r.recipientCount) || 0,
        sentAt: r.sentAt,
        createdByName: r.createdByName || '',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Ошибка кампаний:', error);
    res.status(500).json({ error: 'Ошибка загрузки кампаний' });
  }
});

router.post('/campaigns', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { name, channel = 'whatsapp', segment = 'all', message = '', status = 'draft' } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Укажите название кампании' });
    if (!String(message || '').trim()) return res.status(400).json({ error: 'Укажите текст сообщения' });
    if (!SEGMENTS.some((s) => s.id === segment)) return res.status(400).json({ error: 'Неизвестный сегмент' });

    const recipients = clientsForSegment(req.user.companyId, segment);
    const now = getCurrentTime();
    const result = db
      .prepare(
        `
        INSERT INTO marketing_campaigns (
          companyId, name, channel, segment, message, status, recipientCount, createdByUserId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        req.user.companyId,
        String(name).trim(),
        String(channel),
        segment,
        String(message).trim(),
        status === 'sent' ? 'sent' : 'draft',
        recipients.length,
        req.user.id,
        now,
        now
      );

    const row = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    console.error('Ошибка создания кампании:', error);
    res.status(500).json({ error: 'Ошибка создания кампании' });
  }
});

router.put('/campaigns/:id', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db
      .prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Кампания не найдена' });
    if (existing.status === 'sent') return res.status(400).json({ error: 'Отправленную кампанию нельзя редактировать' });

    const { name, channel, segment, message } = req.body || {};
    const seg = segment || existing.segment;
    const recipients = clientsForSegment(req.user.companyId, seg);
    const now = getCurrentTime();

    db.prepare(
      `
      UPDATE marketing_campaigns
      SET name = ?, channel = ?, segment = ?, message = ?, recipientCount = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `
    ).run(
      String(name ?? existing.name).trim(),
      String(channel ?? existing.channel),
      seg,
      String(message ?? existing.message).trim(),
      recipients.length,
      now,
      id,
      req.user.companyId
    );

    const row = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(id);
    res.json(row);
  } catch (error) {
    console.error('Ошибка обновления кампании:', error);
    res.status(500).json({ error: 'Ошибка обновления кампании' });
  }
});

router.post('/campaigns/:id/send', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const existing = db
      .prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Кампания не найдена' });

    const recipients = clientsForSegment(req.user.companyId, existing.segment);
    const now = getCurrentTime();
    db.prepare(
      `
      UPDATE marketing_campaigns
      SET status = 'sent', recipientCount = ?, sentAt = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `
    ).run(recipients.length, now, now, id, req.user.companyId);

    res.json({
      success: true,
      recipientCount: recipients.length,
      clients: recipients.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        telegram: c.telegram,
        whatsapp: c.whatsapp,
        email: c.email,
      })),
      message: existing.message,
      channel: existing.channel,
    });
  } catch (error) {
    console.error('Ошибка отправки кампании:', error);
    res.status(500).json({ error: 'Ошибка отправки кампании' });
  }
});

router.delete('/campaigns/:id', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM marketing_campaigns WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    if (!result.changes) return res.status(404).json({ error: 'Кампания не найдена' });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления кампании:', error);
    res.status(500).json({ error: 'Ошибка удаления кампании' });
  }
});

module.exports = router;
