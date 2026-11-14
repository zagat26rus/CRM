const crypto = require('crypto');
const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { requireManagement } = require('../middlewares/rbac');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const store = require('./store');
const tg = require('./tgApi');
const bot = require('./bot');
const v = require('./views');
const notifier = require('./notifier');
const { cfg } = require('./config');

const router = express.Router();

const seenUpdates = new Set();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

router.post('/webhook', async (req, res) => {
  const c = cfg();
  if (!c.token || !c.webhookSecret) return res.status(503).json({ error: 'Бот не настроен' });
  if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], c.webhookSecret)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const update = req.body || {};
  if (typeof update.update_id === 'number') {
    if (seenUpdates.has(update.update_id)) return res.json({});
    seenUpdates.add(update.update_id);
    if (seenUpdates.size > 500) seenUpdates.delete(seenUpdates.values().next().value);
  }
  try {
    const result = await bot.processUpdate(update);
    return res.json(result || {});
  } catch (e) {
    console.error('[telegram] webhook:', e?.message || e);
    return res.json({});
  }
});

function describeLink(link) {
  if (!link) return { linked: false };
  return {
    linked: true,
    tgUsername: link.tgUsername,
    tgName: link.tgName,
    linkedAt: link.createdAt,
  };
}

function apiState() {
  const h = tg.health();
  if (!h.up) return { state: 'down', error: h.lastError };
  return { state: h.lastOkAt ? 'ok' : 'unknown', error: '' };
}

router.get('/status', requireAuth, async (req, res) => {
  const c = cfg();
  if (req.query.check === '1' && c.token) {
    try {
      await tg.call('getMe', {}, { timeoutMs: 8000 });
    } catch {
      /* состояние попадёт в apiState */
    }
  }
  const user = store.loadUser(req.user.id);
  res.json({
    configured: Boolean(c.token),
    botUsername: c.botUsername,
    api: apiState(),
    webhookReady: Boolean(c.webhookSecret),
    me: {
      ...describeLink(store.getLinkByUser(req.user.id)),
      phone: user?.phone || '',
      prefs: store.getPrefs(req.user),
    },
    canManage: store.isManagement(req.user.role),
  });
});

router.post('/link-code', requireAuth, (req, res) => {
  const c = cfg();
  if (!c.token) return res.status(503).json({ error: 'Бот не настроен на сервере' });
  const { code, expiresAt } = store.createCode(req.user);
  res.json({ code, expiresAt, deepLink: `https://t.me/${c.botUsername}?start=${code}` });
});

router.delete('/link', requireAuth, (req, res) => {
  store.deleteLinkByUser(req.user.id);
  res.json({ ok: true });
});

function updatePhone(res, targetUser, rawPhone) {
  const phone = String(rawPhone || '').trim();
  if (phone && !isValidPhone(phone)) {
    res.status(400).json({ error: 'Некорректный номер телефона' });
    return false;
  }
  if (phone) {
    const clash = store.findUsersByPhone(phone).find((u) => u.id !== targetUser.id);
    if (clash) {
      res.status(409).json({ error: 'Этот номер уже указан у другого сотрудника' });
      return false;
    }
  }
  store.setUserPhone(targetUser.id, phone ? normalizePhone(phone) : '');
  return true;
}

router.put('/phone', requireAuth, (req, res) => {
  const me = store.loadUser(req.user.id);
  if (!me) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!updatePhone(res, me, req.body?.phone)) return undefined;
  return res.json({ ok: true });
});

router.post('/test', requireAuth, async (req, res) => {
  const link = store.getLinkByUser(req.user.id);
  if (!link) return res.status(400).json({ error: 'Telegram не привязан' });
  try {
    await tg.call('sendMessage', {
      chat_id: link.chatId,
      text: 'Проверка связи: бот FixNet CRM работает.',
      reply_markup: v.mainMenuKeyboard(store.getPrefs(link.user)),
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({
      error: e.network
        ? 'Сервер CRM не смог связаться с Telegram (канал нестабилен). Попробуйте ещё раз через минуту.'
        : e.message,
    });
  }
});

router.get('/staff', requireAuth, requireManagement, (req, res) => {
  const users = store.listCompanyUsers(req.user.companyId);
  const links = new Map(store.listCompanyLinks(req.user.companyId).map((l) => [l.user.id, l]));
  res.json({
    staff: users.map((u) => {
      const link = links.get(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        ...describeLink(link),
        prefs: store.getPrefs(u),
      };
    }),
    permDefs: store.PERM_DEFS,
    notifyDefs: store.NOTIFY_DEFS,
    taskSlots: store.TASK_SLOTS,
  });
});

router.put('/staff/:id', requireAuth, requireManagement, (req, res) => {
  const target = store.loadUser(Number(req.params.id));
  if (!target || target.companyId !== req.user.companyId) return res.status(404).json({ error: 'Сотрудник не найден' });
  if (req.body?.phone !== undefined && !updatePhone(res, target, req.body.phone)) return undefined;
  const prefs = store.savePrefs(target, req.body || {});
  const link = store.getLinkByUser(target.id);
  if (link && link.user.isActive) {
    notifier.push(link.chatId, 'Администратор обновил ваши права и уведомления в боте.', v.mainMenuKeyboard(prefs));
  }
  return res.json({ ok: true, prefs });
});

router.delete('/staff/:id/link', requireAuth, requireManagement, (req, res) => {
  const target = store.loadUser(Number(req.params.id));
  if (!target || target.companyId !== req.user.companyId) return res.status(404).json({ error: 'Сотрудник не найден' });
  store.deleteLinkByUser(target.id);
  return res.json({ ok: true });
});

module.exports = router;
