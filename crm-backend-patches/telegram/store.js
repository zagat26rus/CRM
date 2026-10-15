const crypto = require('crypto');
const { db } = require('../config/database');
const { normalizePhone } = require('../utils/phone');

const MANAGEMENT_ROLES = ['owner', 'admin', 'director'];

const PERM_DEFS = [
  { key: 'orders_view', label: 'Видеть заявки' },
  { key: 'orders_edit', label: 'Менять статус, добавлять фото и комментарии' },
  { key: 'orders_create', label: 'Создавать заявки' },
  { key: 'tasks_view', label: 'Видеть задачи' },
  { key: 'tasks_create', label: 'Создавать задачи' },
  { key: 'stock_view', label: 'Склад и остатки' },
  { key: 'finance_view', label: 'Деньги: выручка, расходы, сводка' },
];

const NOTIFY_DEFS = [
  { key: 'new_order', label: 'Новые заявки' },
  { key: 'order_status', label: 'Смена статуса заявки' },
  { key: 'task_assigned', label: 'Задачи на мою роль' },
  { key: 'task_all', label: 'Все новые задачи' },
  { key: 'daily_summary', label: 'Вечерняя сводка' },
];

const TASK_SLOTS = [
  { id: 'admin', name: 'Администратор' },
  { id: 'tech1', name: 'Техник 1' },
  { id: 'tech2', name: 'Техник 2' },
  { id: 'manager', name: 'Менеджер' },
  { id: 'courier', name: 'Курьер' },
];

function isManagement(role) {
  return MANAGEMENT_ROLES.includes(role);
}

function defaultPrefs(role) {
  if (isManagement(role)) {
    return {
      perms: {
        orders_view: true, orders_edit: true, orders_create: true,
        tasks_view: true, tasks_create: true, stock_view: true, finance_view: true,
        orders_scope: 'all',
      },
      notify: { new_order: true, order_status: true, task_assigned: true, task_all: true, daily_summary: true },
      taskSlots: role === 'director' ? ['manager'] : ['admin', 'manager'],
      summaryHour: 21,
    };
  }
  return {
    perms: {
      orders_view: true, orders_edit: true, orders_create: false,
      tasks_view: true, tasks_create: false, stock_view: true, finance_view: false,
      orders_scope: 'mine',
    },
    notify: { new_order: true, order_status: true, task_assigned: true, task_all: false, daily_summary: false },
    taskSlots: ['tech1', 'tech2'],
    summaryHour: 21,
  };
}

function migrate() {
  db.function('tg_lower', { deterministic: true }, (value) => (value === null || value === undefined ? '' : String(value).toLowerCase()));
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      userId INTEGER NOT NULL UNIQUE,
      chatId TEXT NOT NULL UNIQUE,
      tgUserId TEXT DEFAULT '',
      tgUsername TEXT DEFAULT '',
      tgName TEXT DEFAULT '',
      state TEXT DEFAULT '{}',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_prefs (
      userId INTEGER PRIMARY KEY,
      companyId INTEGER NOT NULL,
      perms TEXT DEFAULT '{}',
      notify TEXT DEFAULT '{}',
      taskSlots TEXT DEFAULT NULL,
      summaryHour INTEGER DEFAULT NULL,
      updatedAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      code TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      companyId INTEGER NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT DEFAULT NULL,
      createdAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_cursors (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS telegram_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      lastError TEXT DEFAULT '',
      createdAt TEXT,
      sentAt TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_pending ON telegram_outbox(sentAt, id);
  `);
}

function parseJson(text, fallback) {
  try {
    const v = JSON.parse(String(text || ''));
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function mergePrefs(role, row) {
  const d = defaultPrefs(role);
  if (!row) return d;
  const slots = parseJson(row.taskSlots, null);
  return {
    perms: { ...d.perms, ...parseJson(row.perms, {}) },
    notify: { ...d.notify, ...parseJson(row.notify, {}) },
    taskSlots: Array.isArray(slots) ? slots.map(String) : d.taskSlots,
    summaryHour: Number.isInteger(row.summaryHour) ? row.summaryHour : d.summaryHour,
  };
}

function getPrefs(user) {
  const row = db.prepare('SELECT * FROM telegram_prefs WHERE userId = ?').get(user.id);
  return mergePrefs(user.role, row);
}

function sanitizePatch(patch) {
  const out = {};
  if (patch.perms && typeof patch.perms === 'object') {
    out.perms = {};
    for (const d of PERM_DEFS) {
      if (patch.perms[d.key] !== undefined) out.perms[d.key] = Boolean(patch.perms[d.key]);
    }
    if (patch.perms.orders_scope !== undefined) {
      out.perms.orders_scope = patch.perms.orders_scope === 'all' ? 'all' : 'mine';
    }
  }
  if (patch.notify && typeof patch.notify === 'object') {
    out.notify = {};
    for (const d of NOTIFY_DEFS) {
      if (patch.notify[d.key] !== undefined) out.notify[d.key] = Boolean(patch.notify[d.key]);
    }
  }
  if (Array.isArray(patch.taskSlots)) {
    const valid = new Set(TASK_SLOTS.map((s) => s.id));
    out.taskSlots = patch.taskSlots.map(String).filter((s) => valid.has(s));
  }
  if (patch.summaryHour !== undefined) {
    const h = Number(patch.summaryHour);
    if (Number.isInteger(h) && h >= 0 && h <= 23) out.summaryHour = h;
  }
  return out;
}

function savePrefs(user, patch) {
  const clean = sanitizePatch(patch || {});
  const current = getPrefs(user);
  const next = {
    perms: { ...current.perms, ...(clean.perms || {}) },
    notify: { ...current.notify, ...(clean.notify || {}) },
    taskSlots: clean.taskSlots || current.taskSlots,
    summaryHour: clean.summaryHour !== undefined ? clean.summaryHour : current.summaryHour,
  };
  db.prepare(
    `INSERT INTO telegram_prefs (userId, companyId, perms, notify, taskSlots, summaryHour, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET perms = excluded.perms, notify = excluded.notify,
       taskSlots = excluded.taskSlots, summaryHour = excluded.summaryHour, updatedAt = excluded.updatedAt`
  ).run(
    user.id,
    user.companyId,
    JSON.stringify(next.perms),
    JSON.stringify(next.notify),
    JSON.stringify(next.taskSlots),
    next.summaryHour,
    new Date().toISOString()
  );
  return next;
}

function rowToLink(row) {
  if (!row) return null;
  const user = {
    id: row.userId,
    companyId: row.companyId,
    name: row.userName,
    email: row.userEmail,
    phone: row.userPhone,
    role: row.userRole,
    isActive: Boolean(row.userActive),
  };
  return {
    id: row.id,
    chatId: row.chatId,
    tgUserId: row.tgUserId,
    tgUsername: row.tgUsername,
    tgName: row.tgName,
    state: parseJson(row.state, {}),
    createdAt: row.createdAt,
    user,
    companyName: row.companyName || '',
  };
}

const LINK_SELECT = `
  SELECT l.*, u.name AS userName, u.email AS userEmail, u.phone AS userPhone,
         u.role AS userRole, u.isActive AS userActive, c.name AS companyName
  FROM telegram_links l
  JOIN users u ON u.id = l.userId
  JOIN companies c ON c.id = u.companyId`;

function getLinkByChat(chatId) {
  return rowToLink(db.prepare(`${LINK_SELECT} WHERE l.chatId = ?`).get(String(chatId)));
}

function getLinkByUser(userId) {
  return rowToLink(db.prepare(`${LINK_SELECT} WHERE l.userId = ?`).get(userId));
}

function listCompanyLinks(companyId) {
  return db
    .prepare(`${LINK_SELECT} WHERE u.companyId = ?`)
    .all(companyId)
    .map(rowToLink);
}

function createLink(user, chatId, from = {}) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM telegram_links WHERE userId = ? OR chatId = ?').run(user.id, String(chatId));
    db.prepare(
      `INSERT INTO telegram_links (companyId, userId, chatId, tgUserId, tgUsername, tgName, state, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`
    ).run(
      user.companyId,
      user.id,
      String(chatId),
      String(from.id || ''),
      String(from.username || ''),
      [from.first_name, from.last_name].filter(Boolean).join(' '),
      now,
      now
    );
  });
  tx();
  return getLinkByChat(chatId);
}

function deleteLinkByUser(userId) {
  return db.prepare('DELETE FROM telegram_links WHERE userId = ?').run(userId).changes;
}

function deleteLinkByChat(chatId) {
  return db.prepare('DELETE FROM telegram_links WHERE chatId = ?').run(String(chatId)).changes;
}

function setState(chatId, state) {
  db.prepare('UPDATE telegram_links SET state = ?, updatedAt = ? WHERE chatId = ?').run(
    JSON.stringify(state || {}),
    new Date().toISOString(),
    String(chatId)
  );
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createCode(user, ttlMinutes = 15) {
  db.prepare('DELETE FROM telegram_link_codes WHERE userId = ? AND usedAt IS NULL').run(user.id);
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO telegram_link_codes (code, userId, companyId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(code, user.id, user.companyId, expiresAt, now.toISOString());
  return { code, expiresAt };
}

function loadUser(userId) {
  const u = db
    .prepare('SELECT id, companyId, name, email, phone, role, isActive FROM users WHERE id = ?')
    .get(userId);
  return u ? { ...u, isActive: Boolean(u.isActive) } : null;
}

function consumeCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return null;
  const nowIso = new Date().toISOString();
  const tx = db.transaction(() => {
    const row = db
      .prepare('SELECT * FROM telegram_link_codes WHERE code = ? AND usedAt IS NULL AND expiresAt > ?')
      .get(code, nowIso);
    if (!row) return null;
    db.prepare('UPDATE telegram_link_codes SET usedAt = ? WHERE code = ?').run(nowIso, code);
    return row.userId;
  });
  const userId = tx();
  if (!userId) return null;
  const user = loadUser(userId);
  return user && user.isActive ? user : null;
}

function findUsersByPhone(phone) {
  const target = normalizePhone(phone);
  if (target.length < 10) return [];
  return db
    .prepare("SELECT id, companyId, name, email, phone, role, isActive FROM users WHERE isActive = 1 AND COALESCE(phone,'') != ''")
    .all()
    .filter((u) => normalizePhone(u.phone) === target)
    .map((u) => ({ ...u, isActive: true }));
}

function setUserPhone(userId, phone) {
  db.prepare('UPDATE users SET phone = ?, updatedAt = ? WHERE id = ?').run(
    String(phone || '').trim(),
    new Date().toISOString(),
    userId
  );
}

function listCompanyUsers(companyId) {
  return db
    .prepare('SELECT id, companyId, name, email, phone, role, isActive FROM users WHERE companyId = ? ORDER BY id')
    .all(companyId)
    .map((u) => ({ ...u, isActive: Boolean(u.isActive) }));
}

function getCursor(key) {
  const row = db.prepare('SELECT value FROM telegram_cursors WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setCursor(key, value) {
  db.prepare(
    'INSERT INTO telegram_cursors (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function enqueue(chatId, payload) {
  db.prepare('INSERT INTO telegram_outbox (chatId, payload, createdAt) VALUES (?, ?, ?)').run(
    String(chatId),
    JSON.stringify(payload),
    new Date().toISOString()
  );
}

function pendingOutbox(limit = 20, maxAgeMs = 2 * 60 * 60 * 1000) {
  const minCreated = new Date(Date.now() - maxAgeMs).toISOString();
  db.prepare("UPDATE telegram_outbox SET sentAt = 'expired', lastError = 'expired' WHERE sentAt IS NULL AND createdAt < ?").run(minCreated);
  return db
    .prepare('SELECT * FROM telegram_outbox WHERE sentAt IS NULL AND attempts < 5 ORDER BY id LIMIT ?')
    .all(limit)
    .map((r) => ({ ...r, payload: parseJson(r.payload, {}) }));
}

function markOutboxSent(id) {
  db.prepare('UPDATE telegram_outbox SET sentAt = ? WHERE id = ?').run(new Date().toISOString(), id);
}

function markOutboxFailed(id, error) {
  db.prepare('UPDATE telegram_outbox SET attempts = attempts + 1, lastError = ? WHERE id = ?').run(String(error || '').slice(0, 300), id);
}

function pruneOutbox() {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM telegram_outbox WHERE createdAt < ?').run(cutoff);
  db.prepare('DELETE FROM telegram_link_codes WHERE expiresAt < ?').run(cutoff);
}

module.exports = {
  PERM_DEFS,
  NOTIFY_DEFS,
  TASK_SLOTS,
  isManagement,
  defaultPrefs,
  migrate,
  getPrefs,
  savePrefs,
  getLinkByChat,
  getLinkByUser,
  listCompanyLinks,
  createLink,
  deleteLinkByUser,
  deleteLinkByChat,
  setState,
  createCode,
  consumeCode,
  loadUser,
  findUsersByPhone,
  setUserPhone,
  listCompanyUsers,
  getCursor,
  setCursor,
  enqueue,
  pendingOutbox,
  markOutboxSent,
  markOutboxFailed,
  pruneOutbox,
};
