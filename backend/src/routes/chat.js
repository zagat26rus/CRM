const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

function pairCompanies(a, b) {
  const one = Math.min(Number(a), Number(b));
  const two = Math.max(Number(a), Number(b));
  return { companyOneId: one, companyTwoId: two };
}

function getPartnerCompanyId(thread, myCompanyId) {
  return thread.companyOneId === myCompanyId ? thread.companyTwoId : thread.companyOneId;
}

function getThreadForCompany(threadId, companyId) {
  return db
    .prepare(
      `
      SELECT * FROM chat_threads
      WHERE id = ? AND (companyOneId = ? OR companyTwoId = ?)
    `
    )
    .get(threadId, companyId, companyId);
}

function getLastReadMessageId(threadId, userId) {
  const row = db
    .prepare('SELECT lastReadMessageId FROM chat_reads WHERE threadId = ? AND userId = ?')
    .get(threadId, userId);
  return row?.lastReadMessageId || 0;
}

function countUnread(threadId, userId, companyId) {
  const lastRead = getLastReadMessageId(threadId, userId);
  const row = db
    .prepare(
      `
      SELECT COUNT(*) as cnt
      FROM chat_messages
      WHERE threadId = ? AND id > ? AND senderCompanyId != ?
    `
    )
    .get(threadId, lastRead, companyId);
  return row?.cnt || 0;
}

router.get('/partners', (req, res) => {
  try {
    const companyId = req.user.companyId;
    const partners = db
      .prepare(
        `
        SELECT c.id, c.name, c.city, c.inn
        FROM companies c
        WHERE c.id != ?
        ORDER BY c.name COLLATE NOCASE ASC, c.id ASC
      `
      )
      .all(companyId);

    res.json({ partners });
  } catch (e) {
    console.error('Ошибка списка партнёров:', e);
    res.status(500).json({ error: 'Ошибка загрузки партнёров' });
  }
});

router.get('/threads', (req, res) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.id;

    const threads = db
      .prepare(
        `
        SELECT t.*
        FROM chat_threads t
        WHERE t.companyOneId = ? OR t.companyTwoId = ?
        ORDER BY COALESCE(t.lastMessageAt, t.createdAt) DESC, t.id DESC
      `
      )
      .all(companyId, companyId);

    const items = threads.map((t) => {
      const partnerCompanyId = getPartnerCompanyId(t, companyId);
      const partner = db.prepare('SELECT id, name, city FROM companies WHERE id = ?').get(partnerCompanyId);
      const lastMessage = db
        .prepare(
          `
          SELECT m.id, m.body, m.createdAt, m.senderCompanyId, u.name as senderName
          FROM chat_messages m
          LEFT JOIN users u ON u.id = m.senderUserId
          WHERE m.threadId = ?
          ORDER BY m.id DESC
          LIMIT 1
        `
        )
        .get(t.id);

      return {
        id: t.id,
        partner: partner || { id: partnerCompanyId, name: 'Партнёр', city: '' },
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              body: lastMessage.body,
              createdAt: lastMessage.createdAt,
              isMine: lastMessage.senderCompanyId === companyId,
              senderName: lastMessage.senderName || ''
            }
          : null,
        unreadCount: countUnread(t.id, userId, companyId)
      };
    });

    res.json({ threads: items });
  } catch (e) {
    console.error('Ошибка списка чатов:', e);
    res.status(500).json({ error: 'Ошибка загрузки чатов' });
  }
});

router.post('/threads', (req, res) => {
  try {
    const companyId = req.user.companyId;
    const partnerCompanyId = Number(req.body?.partnerCompanyId);
    if (!partnerCompanyId || partnerCompanyId === companyId) {
      return res.status(400).json({ error: 'Укажите партнёра' });
    }

    const partner = db.prepare('SELECT id, name, city FROM companies WHERE id = ?').get(partnerCompanyId);
    if (!partner) return res.status(404).json({ error: 'Компания-партнёр не найдена' });

    const pair = pairCompanies(companyId, partnerCompanyId);
    let thread = db
      .prepare('SELECT * FROM chat_threads WHERE companyOneId = ? AND companyTwoId = ?')
      .get(pair.companyOneId, pair.companyTwoId);

    if (!thread) {
      const now = getCurrentTime();
      const result = db
        .prepare(
          `
          INSERT INTO chat_threads (companyOneId, companyTwoId, lastMessageAt, createdAt)
          VALUES (?, ?, NULL, ?)
        `
        )
        .run(pair.companyOneId, pair.companyTwoId, now);
      thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(result.lastInsertRowid);
    }

    res.status(201).json({
      id: thread.id,
      partner
    });
  } catch (e) {
    console.error('Ошибка создания чата:', e);
    res.status(500).json({ error: 'Ошибка создания чата' });
  }
});

router.get('/threads/:id/messages', (req, res) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const threadId = Number(req.params.id);
    const limit = Math.min(100, Math.max(20, Number(req.query.limit) || 50));

    const thread = getThreadForCompany(threadId, companyId);
    if (!thread) return res.status(404).json({ error: 'Чат не найден' });

    const messages = db
      .prepare(
        `
        SELECT m.id, m.body, m.createdAt, m.senderCompanyId, m.senderUserId, u.name as senderName
        FROM chat_messages m
        LEFT JOIN users u ON u.id = m.senderUserId
        WHERE m.threadId = ?
        ORDER BY m.id DESC
        LIMIT ?
      `
      )
      .all(threadId, limit)
      .reverse();

    const lastMessageId = messages.length ? messages[messages.length - 1].id : 0;
    if (lastMessageId) {
      const now = getCurrentTime();
      db.prepare(
        `
        INSERT INTO chat_reads (threadId, userId, lastReadMessageId, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(threadId, userId) DO UPDATE SET
          lastReadMessageId = excluded.lastReadMessageId,
          updatedAt = excluded.updatedAt
      `
      ).run(threadId, userId, lastMessageId, now);
    }

    const partnerCompanyId = getPartnerCompanyId(thread, companyId);
    const partner = db.prepare('SELECT id, name, city FROM companies WHERE id = ?').get(partnerCompanyId);

    res.json({
      thread: { id: thread.id, partner },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        isMine: m.senderCompanyId === companyId,
        senderName: m.senderName || ''
      }))
    });
  } catch (e) {
    console.error('Ошибка загрузки сообщений:', e);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

router.post('/threads/:id/messages', (req, res) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const threadId = Number(req.params.id);
    const body = String(req.body?.message || req.body?.body || '').trim();

    if (!body) return res.status(400).json({ error: 'Сообщение пустое' });
    if (body.length > 4000) return res.status(400).json({ error: 'Сообщение слишком длинное' });

    const thread = getThreadForCompany(threadId, companyId);
    if (!thread) return res.status(404).json({ error: 'Чат не найден' });

    const now = getCurrentTime();
    const result = db
      .prepare(
        `
        INSERT INTO chat_messages (threadId, senderUserId, senderCompanyId, body, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(threadId, userId, companyId, body, now);

    db.prepare('UPDATE chat_threads SET lastMessageAt = ? WHERE id = ?').run(now, threadId);

    const messageId = result.lastInsertRowid;
    db.prepare(
      `
      INSERT INTO chat_reads (threadId, userId, lastReadMessageId, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(threadId, userId) DO UPDATE SET
        lastReadMessageId = excluded.lastReadMessageId,
        updatedAt = excluded.updatedAt
    `
    ).run(threadId, userId, messageId, now);

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

    res.status(201).json({
      id: messageId,
      body,
      createdAt: now,
      isMine: true,
      senderName: user?.name || ''
    });
  } catch (e) {
    console.error('Ошибка отправки сообщения:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

module.exports = router;
