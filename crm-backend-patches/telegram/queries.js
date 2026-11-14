const { db } = require('../config/database');
const {
  CLOSED_SUCCESS_STATUSES,
  CANCELLED_STATUSES,
  CLOSED_FAILED_STATUSES,
} = require('../constants/orderStatuses');
const { getCompanySettings } = require('../utils/companySettings');
const { normalizePhone } = require('../utils/phone');
const { SALE_CATEGORIES } = require('../constants/saleCategories');
const { isManagement } = require('./store');

const CLOSED_STATUSES = Array.from(
  new Set([
    ...CLOSED_SUCCESS_STATUSES,
    ...CANCELLED_STATUSES,
    ...CLOSED_FAILED_STATUSES,
    'Выдан',
    'Отменён',
    'Отменен',
    'Отмена',
  ])
);

const READY_STATUSES = ['Готово', 'Готов'];
const NEW_STATUSES = ['Создана', 'Принята', 'Новый'];

const PAGE_SIZE = 8;
const ITEMS_PAGE_SIZE = 15;

function placeholders(list) {
  return list.map(() => '?').join(',');
}

function hasTable(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name));
}

// ---------- Заявки ----------

function orderScopeSql(user, prefs, alias = 'o') {
  const where = [`${alias}.companyId = ?`];
  const params = [user.companyId];
  if (prefs.perms.orders_scope !== 'all') {
    where.push(`(${alias}.executorName = ? OR ${alias}.managerName = ?)`);
    params.push(user.name, user.name);
  }
  return { where, params };
}

function orderCanSee(user, prefs, order) {
  if (!order || order.companyId !== user.companyId) return false;
  if (prefs.perms.orders_scope === 'all') return true;
  return order.executorName === user.name || order.managerName === user.name;
}

function listOrders(user, prefs, { filter = 'active', page = 0, q = '' } = {}) {
  const { where, params } = orderScopeSql(user, prefs);
  const text = String(q || '').trim();

  if (text) {
    const like = `%${text.toLowerCase()}%`;
    const digits = normalizePhone(text);
    const parts = ['client', 'model', 'brand', 'imei', 'documentNumber', 'problem'].map((c) => `tg_lower(o.${c}) LIKE ?`);
    const p = [like, like, like, like, like, like];
    if (digits.length >= 4) {
      parts.push('o.phone LIKE ?');
      p.push(`%${digits.slice(-10)}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
    params.push(...p);
  } else if (filter === 'active') {
    where.push(`COALESCE(o.status,'') NOT IN (${placeholders(CLOSED_STATUSES)})`);
    params.push(...CLOSED_STATUSES);
  } else if (filter === 'new') {
    where.push(`o.status IN (${placeholders(NEW_STATUSES)})`);
    params.push(...NEW_STATUSES);
  } else if (filter === 'ready') {
    where.push(`o.status IN (${placeholders(READY_STATUSES)})`);
    params.push(...READY_STATUSES);
  } else if (filter === 'work') {
    where.push(`COALESCE(o.status,'') NOT IN (${placeholders([...CLOSED_STATUSES, ...READY_STATUSES, ...NEW_STATUSES])})`);
    params.push(...CLOSED_STATUSES, ...READY_STATUSES, ...NEW_STATUSES);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT o.id, o.client, o.phone, o.brand, o.model, o.status, o.price, o.createdAt, o.isUrgent
       FROM orders o ${whereSql}
       ORDER BY o.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, page * PAGE_SIZE);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

function getOrder(user, prefs, id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(Number(id), user.companyId);
  if (!order || !orderCanSee(user, prefs, order)) return null;
  const problems = db
    .prepare('SELECT problemName, price FROM order_problems WHERE orderId = ? ORDER BY sortOrder')
    .all(order.id);
  const history = db
    .prepare('SELECT type, message, createdAt FROM order_history WHERE orderId = ? AND companyId = ? ORDER BY id DESC LIMIT 4')
    .all(order.id, user.companyId);
  const files = db
    .prepare("SELECT COUNT(*) AS c FROM order_history WHERE orderId = ? AND companyId = ? AND type = 'file'")
    .get(order.id, user.companyId).c;
  return { order, problems, history, files };
}

function orderStatuses(companyId) {
  return getCompanySettings(db, companyId).orderStatuses;
}

// ---------- Задачи ----------

function taskVisible(user, prefs, task) {
  if (!task || task.companyId !== user.companyId) return false;
  if (isManagement(user.role)) return true;
  return prefs.taskSlots.includes(String(task.assignedTo || ''));
}

function listTasks(user, prefs, { page = 0, filter = 'open' } = {}) {
  const where = ['t.companyId = ?'];
  const params = [user.companyId];
  if (filter === 'open') where.push('COALESCE(t.isCompleted,0) = 0');
  if (!isManagement(user.role)) {
    if (prefs.taskSlots.length === 0) return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    where.push(`t.assignedTo IN (${placeholders(prefs.taskSlots)})`);
    params.push(...prefs.taskSlots);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM tasks t ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT t.* FROM tasks t ${whereSql}
       ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                COALESCE(t.dueDate,'9999'), t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, page * PAGE_SIZE);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

function getTask(user, prefs, id) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND companyId = ?').get(Number(id), user.companyId);
  if (!task || !taskVisible(user, prefs, task)) return null;
  const order = task.orderId
    ? db.prepare('SELECT id, client, phone FROM orders WHERE id = ? AND companyId = ?').get(task.orderId, user.companyId)
    : null;
  return { task, order };
}

// ---------- Склад ----------

function stockThreshold(companyId) {
  return getCompanySettings(db, companyId).dailyDigest.lowStockThreshold;
}

function stockOverview(companyId) {
  const threshold = stockThreshold(companyId);
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS skus,
              COALESCE(SUM(quantity),0) AS qty,
              COALESCE(SUM(MAX(quantity,0) * purchasePrice),0) AS costValue,
              COALESCE(SUM(MAX(quantity,0) * salePrice),0) AS saleValue,
              COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END),0) AS zero,
              COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= ? THEN 1 ELSE 0 END),0) AS low
       FROM inventory_items WHERE companyId = ?`
    )
    .get(threshold, companyId);
  const categories = db
    .prepare(
      `SELECT c.id, c.name,
              COUNT(i.id) AS skus,
              COALESCE(SUM(i.quantity),0) AS qty,
              COALESCE(SUM(MAX(i.quantity,0) * i.purchasePrice),0) AS costValue,
              COALESCE(SUM(MAX(i.quantity,0) * i.salePrice),0) AS saleValue
       FROM inventory_categories c
       LEFT JOIN inventory_items i ON i.categoryId = c.id AND i.companyId = c.companyId
       WHERE c.companyId = ? AND COALESCE(c.isActive,1) = 1
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`
    )
    .all(companyId);
  const uncategorized = db
    .prepare(
      `SELECT COUNT(*) AS skus, COALESCE(SUM(quantity),0) AS qty,
              COALESCE(SUM(MAX(quantity,0) * purchasePrice),0) AS costValue,
              COALESCE(SUM(MAX(quantity,0) * salePrice),0) AS saleValue
       FROM inventory_items
       WHERE companyId = ? AND (categoryId IS NULL OR categoryId NOT IN (SELECT id FROM inventory_categories WHERE companyId = ?))`
    )
    .get(companyId, companyId);
  return { threshold, totals, categories, uncategorized };
}

function listStockItems(companyId, { categoryId = null, filter = 'all', q = '', page = 0 } = {}) {
  const threshold = stockThreshold(companyId);
  const where = ['i.companyId = ?'];
  const params = [companyId];
  if (categoryId === 0) {
    where.push('(i.categoryId IS NULL OR i.categoryId NOT IN (SELECT id FROM inventory_categories WHERE companyId = ?))');
    params.push(companyId);
  } else if (categoryId) {
    where.push('i.categoryId = ?');
    params.push(categoryId);
  }
  if (filter === 'low') {
    where.push('i.quantity <= ?');
    params.push(threshold);
  } else if (filter === 'instock') {
    where.push('i.quantity > 0');
  }
  const text = String(q || '').trim();
  if (text) {
    where.push('(tg_lower(i.name) LIKE ? OR tg_lower(i.sku) LIKE ?)');
    params.push(`%${text.toLowerCase()}%`, `%${text.toLowerCase()}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM inventory_items i ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT i.id, i.name, i.sku, i.quantity, i.unit, i.purchasePrice, i.salePrice
       FROM inventory_items i ${whereSql}
       ORDER BY i.name COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...params, ITEMS_PAGE_SIZE, page * ITEMS_PAGE_SIZE);
  return { rows, total, page, pageSize: ITEMS_PAGE_SIZE, threshold };
}

// ---------- Сводка ----------

function periodSummary(companyId, range, { withMoney = true } = {}) {
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const out = { fromIso, toIso };

  if (withMoney) {
    const dateExpr = "COALESCE(NULLIF(p.date,''), p.createdAt)";
    const pay = db
      .prepare(
        `SELECT p.type, COALESCE(SUM(p.amount),0) AS total, COUNT(*) AS cnt
         FROM payments p
         WHERE p.companyId = ? AND ${dateExpr} >= ? AND ${dateExpr} < ?
         GROUP BY p.type`
      )
      .all(companyId, fromIso, toIso);
    const inc = pay.find((r) => r.type === 'income') || { total: 0, cnt: 0 };
    const exp = pay.find((r) => r.type === 'expense') || { total: 0, cnt: 0 };
    out.income = inc.total;
    out.incomeCount = inc.cnt;
    out.expense = exp.total;
    out.expenseCount = exp.cnt;
    out.profit = inc.total - exp.total;

    out.bySource = db
      .prepare(
        `SELECT COALESCE(NULLIF(p.saleCategory,''),'other') AS cat, COALESCE(SUM(p.amount),0) AS total
         FROM payments p
         WHERE p.companyId = ? AND p.type = 'income' AND ${dateExpr} >= ? AND ${dateExpr} < ?
         GROUP BY cat ORDER BY total DESC`
      )
      .all(companyId, fromIso, toIso)
      .map((r) => ({ label: SALE_CATEGORIES[r.cat]?.label || 'Прочее', total: r.total }));

    out.byMethod = db
      .prepare(
        `SELECT COALESCE(NULLIF(p.method,''),'other') AS method, COALESCE(SUM(p.amount),0) AS total
         FROM payments p
         WHERE p.companyId = ? AND p.type = 'income' AND ${dateExpr} >= ? AND ${dateExpr} < ?
         GROUP BY method ORDER BY total DESC`
      )
      .all(companyId, fromIso, toIso);

    const bal = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS inc,
                COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS exp
         FROM payments WHERE companyId = ?`
      )
      .get(companyId);
    out.balance = bal.inc - bal.exp;
  }

  out.ordersCreated = db
    .prepare('SELECT COUNT(*) AS c FROM orders WHERE companyId = ? AND createdAt >= ? AND createdAt < ?')
    .get(companyId, fromIso, toIso).c;

  const closedList = CLOSED_SUCCESS_STATUSES;
  out.ordersIssued = db
    .prepare(
      `SELECT COUNT(DISTINCT orderId) AS c FROM order_history
       WHERE companyId = ? AND type = 'status' AND createdAt >= ? AND createdAt < ?
         AND json_extract(meta,'$.newStatus') IN (${placeholders(closedList)})`
    )
    .get(companyId, fromIso, toIso, ...closedList).c;

  out.ordersOpen = db
    .prepare(`SELECT COUNT(*) AS c FROM orders WHERE companyId = ? AND COALESCE(status,'') NOT IN (${placeholders(CLOSED_STATUSES)})`)
    .get(companyId, ...CLOSED_STATUSES).c;
  out.ordersReady = db
    .prepare(`SELECT COUNT(*) AS c FROM orders WHERE companyId = ? AND status IN (${placeholders(READY_STATUSES)})`)
    .get(companyId, ...READY_STATUSES).c;
  out.ordersOverdue = db
    .prepare(
      `SELECT COUNT(*) AS c FROM orders
       WHERE companyId = ? AND dueAt IS NOT NULL AND dueAt != '' AND dueAt < ?
         AND COALESCE(status,'') NOT IN (${placeholders([...CLOSED_STATUSES, ...READY_STATUSES])})`
    )
    .get(companyId, new Date().toISOString(), ...CLOSED_STATUSES, ...READY_STATUSES).c;

  if (hasTable('shop_orders')) {
    const shop = db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS s FROM shop_orders
         WHERE companyId = ? AND status NOT IN ('cancelled','refunded') AND createdAt >= ? AND createdAt < ?`
      )
      .get(companyId, fromIso, toIso);
    out.shopSales = shop.c;
    out.shopTotal = shop.s;
  }

  out.tasksOpen = db
    .prepare('SELECT COUNT(*) AS c FROM tasks WHERE companyId = ? AND COALESCE(isCompleted,0) = 0')
    .get(companyId).c;
  out.tasksOverdue = db
    .prepare(
      "SELECT COUNT(*) AS c FROM tasks WHERE companyId = ? AND COALESCE(isCompleted,0) = 0 AND dueDate IS NOT NULL AND dueDate != '' AND dueDate < ?"
    )
    .get(companyId, new Date().toISOString().slice(0, 10)).c;

  const stock = stockOverview(companyId);
  out.stockZero = stock.totals.zero;
  out.stockLow = stock.totals.low;
  out.stockLowItems = db
    .prepare(
      'SELECT name, quantity, unit FROM inventory_items WHERE companyId = ? AND quantity <= ? ORDER BY quantity, name LIMIT 8'
    )
    .all(companyId, stock.threshold);
  return out;
}

module.exports = {
  PAGE_SIZE,
  ITEMS_PAGE_SIZE,
  CLOSED_STATUSES,
  READY_STATUSES,
  listOrders,
  getOrder,
  orderCanSee,
  orderStatuses,
  taskVisible,
  listTasks,
  getTask,
  stockOverview,
  listStockItems,
  periodSummary,
};
