const { db } = require('../config/database');
const store = require('./store');
const q = require('./queries');
const v = require('./views');
const tg = require('./tgApi');
const recent = require('./recent');
const { cfg } = require('./config');
const { esc, money, formatDate, phonePretty, clip, periodRange, zonedHour, zonedDateKey } = require('./format');

const EVENT_POLL_MS = Number(process.env.TELEGRAM_EVENT_POLL_MS) || 7000;
const OUTBOX_MS = Number(process.env.TELEGRAM_OUTBOX_MS) || 2000;
const SUMMARY_MS = 60 * 1000;
const WEBHOOK_MS = 5 * 60 * 1000;

let started = false;
let sending = false;

function recipients(companyId, test) {
  return store
    .listCompanyLinks(companyId)
    .filter((l) => l.user.isActive)
    .map((l) => ({ link: l, prefs: store.getPrefs(l.user) }))
    .filter((r) => test(r.link.user, r.prefs));
}

function push(chatId, text, kb) {
  store.enqueue(chatId, { text, kb });
}

function maxId(table) {
  return db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${table}`).get().m;
}

function initCursors() {
  for (const [key, table] of [['orders', 'orders'], ['history', 'order_history'], ['tasks', 'tasks']]) {
    if (store.getCursor(key) === null) store.setCursor(key, maxId(table));
  }
}

function orderBrief(o) {
  const device = [o.brand, o.model].filter(Boolean).join(' ');
  const lines = [`Клиент: ${esc(o.client)}${o.phone ? `, ${esc(phonePretty(o.phone))}` : ''}`];
  if (device) lines.push(`Устройство: ${esc(device)}`);
  if (o.problem) lines.push(`Неисправность: ${esc(clip(o.problem, 200))}`);
  return lines;
}

function notifyNewOrder(o) {
  const actor = recent.actorOf('order', o.id);
  const list = recipients(o.companyId, (user, prefs) => {
    if (user.id === actor) return false;
    return prefs.notify.new_order && prefs.perms.orders_view && q.orderCanSee(user, prefs, o);
  });
  if (!list.length) return;
  const lines = [`<b>Новая заявка #${o.id}</b>`, ...orderBrief(o)];
  if (Number(o.price) > 0) lines.push(`Стоимость: ${money(o.price)}`);
  if (o.managerName) lines.push(`Принял: ${esc(o.managerName)}`);
  const kb = v.inline([[v.btn('Открыть заявку', `ov:${o.id}`)]]);
  for (const r of list) push(r.link.chatId, lines.join('\n'), kb);
}

function notifyStatus(h, o) {
  const meta = (() => {
    try {
      return JSON.parse(h.meta || '{}');
    } catch {
      return {};
    }
  })();
  const list = recipients(o.companyId, (user, prefs) => {
    if (user.id === h.createdByUserId) return false;
    return prefs.notify.order_status && prefs.perms.orders_view && q.orderCanSee(user, prefs, o);
  });
  if (!list.length) return;
  const who = h.createdByUserId ? db.prepare('SELECT name FROM users WHERE id = ?').get(h.createdByUserId)?.name : '';
  const lines = [
    `<b>Заявка #${o.id}: статус изменён</b>`,
    meta.oldStatus && meta.newStatus ? `${esc(meta.oldStatus)} → <b>${esc(meta.newStatus)}</b>` : esc(h.message),
    ...orderBrief(o),
  ];
  if (who) lines.push(`Изменил: ${esc(who)}`);
  const kb = v.inline([[v.btn('Открыть заявку', `ov:${o.id}`)]]);
  for (const r of list) push(r.link.chatId, lines.join('\n'), kb);
}

function notifyNewTask(t) {
  const actor = recent.actorOf('task', t.id);
  const list = recipients(t.companyId, (user, prefs) => {
    if (user.id === actor) return false;
    if (!prefs.perms.tasks_view || !q.taskVisible(user, prefs, t)) return false;
    return prefs.notify.task_all || (prefs.notify.task_assigned && prefs.taskSlots.includes(String(t.assignedTo || '')));
  });
  if (!list.length) return;
  const lines = [`<b>Новая задача #${t.id}</b>`, esc(clip(t.title, 300)), `Кому: ${esc(v.slotName(t.assignedTo))}`];
  lines.push(`Приоритет: ${v.PRIORITY_LABEL[t.priority] || t.priority}`);
  if (t.dueDate) lines.push(`Срок: ${esc(formatDate(t.dueDate))}`);
  const kb = v.inline([[v.btn('Открыть задачу', `tv:${t.id}`)]]);
  for (const r of list) push(r.link.chatId, lines.join('\n'), kb);
}

function pollEvents() {
  const lastOrder = Number(store.getCursor('orders') || 0);
  const orders = db.prepare('SELECT * FROM orders WHERE id > ? ORDER BY id LIMIT 50').all(lastOrder);
  for (const o of orders) {
    try {
      if (o.companyId) notifyNewOrder(o);
    } catch (e) {
      console.error('[telegram] new order notify:', e.message);
    }
    store.setCursor('orders', o.id);
  }

  const lastHist = Number(store.getCursor('history') || 0);
  const hist = db
    .prepare(
      `SELECT h.* FROM order_history h WHERE h.id > ? ORDER BY h.id LIMIT 200`
    )
    .all(lastHist);
  for (const h of hist) {
    if (h.type === 'status') {
      try {
        const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(h.orderId);
        if (o && o.companyId) notifyStatus(h, o);
      } catch (e) {
        console.error('[telegram] status notify:', e.message);
      }
    }
    store.setCursor('history', h.id);
  }

  const lastTask = Number(store.getCursor('tasks') || 0);
  const tasks = db.prepare('SELECT * FROM tasks WHERE id > ? ORDER BY id LIMIT 50').all(lastTask);
  for (const t of tasks) {
    try {
      if (t.companyId) notifyNewTask(t);
    } catch (e) {
      console.error('[telegram] task notify:', e.message);
    }
    store.setCursor('tasks', t.id);
  }
}

async function drainOutbox() {
  if (sending) return;
  sending = true;
  try {
    const rows = store.pendingOutbox(15);
    for (const row of rows) {
      if (!tg.isUp()) break;
      const { text, kb } = row.payload;
      try {
        await tg.call('sendMessage', {
          chat_id: row.chatId,
          text: String(text || '').slice(0, 4000),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(kb ? { reply_markup: kb } : {}),
        });
        store.markOutboxSent(row.id);
      } catch (e) {
        if (e.network) break;
        store.markOutboxFailed(row.id, e.message);
        if (e.code === 403) store.markOutboxFailed(row.id, 'blocked');
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    sending = false;
  }
}

function tickSummary() {
  const hour = zonedHour();
  const dateKey = zonedDateKey();
  const cache = new Map();
  const links = db
    .prepare('SELECT l.userId, l.chatId, u.companyId FROM telegram_links l JOIN users u ON u.id = l.userId WHERE u.isActive = 1')
    .all();
  for (const l of links) {
    const user = store.loadUser(l.userId);
    if (!user) continue;
    const prefs = store.getPrefs(user);
    if (!prefs.notify.daily_summary || !prefs.perms.finance_view || prefs.summaryHour !== hour) continue;
    const key = `summary:${user.id}:${dateKey}`;
    if (store.getCursor(key) !== null) continue;
    store.setCursor(key, Date.now());
    if (!cache.has(user.companyId)) {
      const range = periodRange('today');
      cache.set(user.companyId, q.periodSummary(user.companyId, range, { withMoney: true }));
    }
    const { label, dateLabel } = v.summaryRangeLabel('today');
    const text = `<b>Вечерняя сводка</b>\n\n${v.summaryText(cache.get(user.companyId), label, { withMoney: true, dateLabel })}`;
    push(l.chatId, text, v.summaryKeyboard('today'));
  }
}

async function ensureWebhook() {
  const c = cfg();
  if (!c.token || !c.webhookSecret || !tg.isUp()) return;
  try {
    const info = await tg.call('getWebhookInfo', {});
    if (info.url === c.webhookUrl) return;
    await tg.call('setWebhook', {
      url: c.webhookUrl,
      secret_token: c.webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 10,
    });
    console.log('[telegram] webhook установлен');
  } catch (e) {
    if (!e.network) console.error('[telegram] webhook:', e.message);
  }
}

const POLL_TIMEOUT_S = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollLoop() {
  const bot = require('./bot');
  let webhookCleared = false;
  let offset = Number(store.getCursor('tg_offset')) || 0;
  for (;;) {
    try {
      if (!webhookCleared) {
        await tg.call('deleteWebhook', { drop_pending_updates: false });
        webhookCleared = true;
        console.log('[telegram] режим long polling');
      }
      const updates = await tg.call(
        'getUpdates',
        { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message', 'callback_query'] },
        { timeoutMs: (POLL_TIMEOUT_S + 40) * 1000 }
      );
      for (const u of updates) {
        offset = u.update_id + 1;
        store.setCursor('tg_offset', offset);
        bot.processUpdate(u).catch((e) => console.error('[telegram] update:', e?.message || e));
      }
    } catch (e) {
      if (!e.network) console.error('[telegram] getUpdates:', e.message);
      if (e.code === 409) webhookCleared = false;
      await sleep(e.network ? 1000 : 3000);
    }
  }
}

function start() {
  if (started) return;
  started = true;
  const c = cfg();
  if (!c.token) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN не задан — бот отключён');
    return;
  }
  initCursors();
  setInterval(() => {
    try {
      pollEvents();
    } catch (e) {
      console.error('[telegram] poll:', e.message);
    }
  }, EVENT_POLL_MS);
  setInterval(() => {
    drainOutbox().catch((e) => console.error('[telegram] outbox:', e.message));
  }, OUTBOX_MS);
  setInterval(() => {
    try {
      tickSummary();
      store.pruneOutbox();
    } catch (e) {
      console.error('[telegram] summary:', e.message);
    }
  }, SUMMARY_MS);
  if (c.mode === 'polling') {
    pollLoop().catch((e) => console.error('[telegram] poll loop stopped:', e?.message || e));
  } else {
    setInterval(() => ensureWebhook().catch(() => {}), WEBHOOK_MS);
    ensureWebhook().catch(() => {});
  }
  console.log(`[telegram] бот запущен (${c.mode})`);
}

module.exports = { start, pollEvents, drainOutbox, tickSummary, push, ensureWebhook };
