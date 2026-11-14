const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const {
  SALE_CATEGORIES,
  SALE_CATEGORY_IDS,
  isSaleCategory,
  defaultSaleCategoryForDocType,
} = require('../constants/saleCategories');

router.use(requireAuth);

function parsePaymentDate(iso) {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKeyFromOffset(daysAgo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return dateKeyFromOffset(0);
}

function parseTrendPeriod(queryDays) {
  const raw = String(queryDays ?? '7').trim().toLowerCase();
  if (raw === 'all' || raw === '0' || raw === 'full') {
    return { mode: 'all' };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return { mode: 'days', days: 7 };
  }
  return { mode: 'days', days: Math.min(3650, Math.floor(n)) };
}

function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

function buildBucketPlan(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const spanDays =
    Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())
      ? Math.floor((to.getTime() - from.getTime()) / 86400000) + 1
      : 1;
  const granularity = spanDays > 400 ? 'month' : 'day';
  const buckets = [];
  const map = new Map();

  if (granularity === 'month') {
    let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      buckets.push(key);
      map.set(key, { date: key, turnover: 0, cost: 0, profit: 0, count: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = new Date(from);
    while (cursor <= to) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      const k = `${y}-${m}-${day}`;
      buckets.push(k);
      map.set(k, { date: k, turnover: 0, cost: 0, profit: 0, count: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return { buckets, map, granularity, spanDays, fromDate, toDate };
}

function saleBucketKey(date, granularity) {
  if (!date) return null;
  return granularity === 'month' ? monthKey(date) : date;
}

function loadDocumentsMap(companyId) {
  const rows = db
    .prepare('SELECT id, docType, dataJson FROM company_documents WHERE companyId = ?')
    .all(companyId);
  const map = new Map();
  for (const row of rows) {
    let data = {};
    try {
      data = JSON.parse(row.dataJson || '{}');
    } catch {
      data = {};
    }
    map.set(row.id, { docType: row.docType, data });
  }
  return map;
}

function inferSaleCategory(payment, documentsById) {
  if (isSaleCategory(payment.saleCategory)) return payment.saleCategory;
  if (payment.orderId) return 'repair';
  if (payment.documentId) {
    const doc = documentsById.get(payment.documentId);
    if (doc?.data?.saleCategory && isSaleCategory(doc.data.saleCategory)) {
      return doc.data.saleCategory;
    }
    return defaultSaleCategoryForDocType(doc?.docType || '');
  }
  const desc = String(payment.description || '');
  const cat = String(payment.categoryName || '');
  if (cat.includes('магазина') || desc.includes('магазина')) return 'tech';
  if (cat.includes('склада') || desc.includes('склада')) return 'parts';
  if (desc.includes('Оплата заказа')) return 'repair';
  if (cat.includes('документу') || desc.includes('Чек') || desc.includes('КАССОВЫЙ')) return 'tech';
  return 'tech';
}

function findCostForIncome(income, expenses) {
  if (income.documentId) {
    return expenses
      .filter(
        (p) =>
          p.documentId === income.documentId &&
          p.type === 'expense' &&
          String(p.description || '').includes('Себестоимость')
      )
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  if (income.orderId) {
    return expenses
      .filter(
        (p) =>
          p.orderId === income.orderId &&
          p.type === 'expense' &&
          String(p.description || '').includes('Себестоимость')
      )
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  const prefix = `Себестоимость: ${income.description}`;
  return expenses
    .filter((p) => p.type === 'expense' && String(p.description || '') === prefix)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

router.get('/trends', (req, res) => {
  try {
    const period = parseTrendPeriod(req.query.days);
    const categoryFilter = String(req.query.category || 'all');

    const payments = db
      .prepare(
        `
        SELECT p.*, c.name as categoryName
        FROM payments p
        LEFT JOIN categories c ON p.categoryId = c.id
        WHERE p.companyId = ?
        ORDER BY p.date DESC, p.createdAt DESC
      `
      )
      .all(req.user.companyId);

    const documentsById = loadDocumentsMap(req.user.companyId);
    const incomes = payments.filter((p) => p.type === 'income');
    const expenses = payments.filter((p) => p.type === 'expense');

    const allSales = incomes
      .map((p) => {
        const date = parsePaymentDate(p.date || p.createdAt);
        const saleCategory = inferSaleCategory(p, documentsById);
        const cost = findCostForIncome(p, expenses);
        const amount = Number(p.amount) || 0;
        return {
          id: p.id,
          date,
          amount,
          cost,
          profit: amount - cost,
          saleCategory,
          description: p.description,
          documentId: p.documentId,
          orderId: p.orderId,
        };
      })
      .filter((s) => Boolean(s.date));

    const toDate = todayKey();
    let fromDate = toDate;
    let days = 7;
    let periodMode = period.mode;

    if (period.mode === 'all') {
      const dated = allSales.map((s) => s.date).filter(Boolean).sort();
      fromDate = dated[0] || toDate;
      days = Math.max(1, Math.floor((new Date(`${toDate}T00:00:00`) - new Date(`${fromDate}T00:00:00`)) / 86400000) + 1);
    } else {
      days = period.days;
      fromDate = dateKeyFromOffset(days - 1);
    }

    const bucketPlan = buildBucketPlan(fromDate, toDate);
    const { map: dayMap, granularity } = bucketPlan;

    const sales = allSales
      .filter((s) => s.date >= fromDate && s.date <= toDate)
      .filter((s) => categoryFilter === 'all' || s.saleCategory === categoryFilter);

    const turnover = sales.reduce((s, x) => s + x.amount, 0);
    const costs = sales.reduce((s, x) => s + x.cost, 0);
    const profit = turnover - costs;
    const salesCount = sales.length;
    const avgCheck = salesCount > 0 ? turnover / salesCount : 0;

    for (const s of sales) {
      const bucketKey = saleBucketKey(s.date, granularity);
      const bucket = dayMap.get(bucketKey);
      if (!bucket) continue;
      bucket.turnover += s.amount;
      bucket.cost += s.cost;
      bucket.profit += s.profit;
      bucket.count += 1;
    }
    const byDay = bucketPlan.buckets.map((k) => dayMap.get(k));

    const byCategory = {};
    for (const id of SALE_CATEGORY_IDS) {
      byCategory[id] = { turnover: 0, cost: 0, profit: 0, count: 0 };
    }
    for (const s of sales) {
      const bucket = byCategory[s.saleCategory];
      if (!bucket) continue;
      bucket.turnover += s.amount;
      bucket.cost += s.cost;
      bucket.profit += s.profit;
      bucket.count += 1;
    }

    const allSalesInPeriod = allSales.filter((s) => s.date >= fromDate && s.date <= toDate);

    const categoryBreakdown = {};
    for (const id of SALE_CATEGORY_IDS) {
      categoryBreakdown[id] = { turnover: 0, cost: 0, profit: 0, count: 0, label: SALE_CATEGORIES[id].label };
    }
    for (const s of allSalesInPeriod) {
      const bucket = categoryBreakdown[s.saleCategory];
      if (!bucket) continue;
      bucket.turnover += s.amount;
      bucket.cost += s.cost;
      bucket.profit += s.profit;
      bucket.count += 1;
    }

    const balanceRow = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
        FROM payments WHERE companyId = ?
      `
      )
      .get(req.user.companyId);

    res.json({
      days: periodMode === 'all' ? 'all' : days,
      periodMode,
      fromDate,
      toDate,
      granularity,
      category: categoryFilter,
      turnover,
      cost: costs,
      profit,
      salesCount,
      avgCheck,
      balance: (Number(balanceRow?.income) || 0) - (Number(balanceRow?.expense) || 0),
      byDay,
      byCategory,
      categoryBreakdown,
      categories: SALE_CATEGORY_IDS.map((id) => ({ id, label: SALE_CATEGORIES[id].label })),
      recentSales: sales.slice(0, 15),
    });
  } catch (error) {
    console.error('Ошибка аналитики трендов:', error);
    res.status(500).json({ error: 'Ошибка загрузки аналитики' });
  }
});

function normalizeProblemLabel(value, fallback = 'Без названия') {
  const s = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  return s || fallback;
}

function orderDateKey(iso) {
  return parsePaymentDate(iso);
}

/**
 * Сводка самых частых поломок / обращений.
 * Категория = тип устройства (deviceType): Смартфон, Планшет и т.д.
 */
router.get('/top-problems', (req, res) => {
  try {
    const period = parseTrendPeriod(req.query.days);
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 15));
    const companyId = req.user.companyId;

    const toDate = todayKey();
    let fromDate = toDate;
    let days = 7;
    let periodMode = period.mode;

    if (period.mode === 'all') {
      const oldest = db
        .prepare(
          `SELECT MIN(createdAt) as d FROM orders WHERE companyId = ? AND createdAt IS NOT NULL`
        )
        .get(companyId);
      fromDate = orderDateKey(oldest?.d) || toDate;
      days = Math.max(
        1,
        Math.floor((new Date(`${toDate}T00:00:00`) - new Date(`${fromDate}T00:00:00`)) / 86400000) + 1
      );
    } else {
      days = period.days;
      fromDate = dateKeyFromOffset(days - 1);
    }

    const orders = db
      .prepare(
        `
        SELECT id, problem, deviceType, price, costPrice, createdAt
        FROM orders
        WHERE companyId = ?
      `
      )
      .all(companyId);

    const ordersInPeriod = orders.filter((o) => {
      const d = orderDateKey(o.createdAt);
      return d && d >= fromDate && d <= toDate;
    });
    const orderIds = ordersInPeriod.map((o) => o.id);
    const orderById = new Map(ordersInPeriod.map((o) => [o.id, o]));

    /** @type {Array<{ name: string, category: string, price: number, orderId: number }>} */
    const rows = [];

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const problemRows = db
        .prepare(
          `
          SELECT orderId, problemName, price
          FROM order_problems
          WHERE orderId IN (${placeholders})
        `
        )
        .all(...orderIds);

      const ordersWithProblems = new Set();
      for (const p of problemRows) {
        const order = orderById.get(p.orderId);
        if (!order) continue;
        ordersWithProblems.add(p.orderId);
        rows.push({
          name: normalizeProblemLabel(p.problemName),
          category: normalizeProblemLabel(order.deviceType, 'Другое'),
          price: Number(p.price) || 0,
          orderId: p.orderId,
        });
      }

      // Legacy: заказ без строк в order_problems — берём orders.problem
      for (const o of ordersInPeriod) {
        if (ordersWithProblems.has(o.id)) continue;
        const name = normalizeProblemLabel(o.problem, '');
        if (!name) continue;
        rows.push({
          name,
          category: normalizeProblemLabel(o.deviceType, 'Другое'),
          price: Number(o.price) || 0,
          orderId: o.id,
        });
      }
    }

    // Агрегация по поломке (без учёта регистра)
    const problemMap = new Map();
    for (const r of rows) {
      const key = `${r.name.toLowerCase()}||${r.category.toLowerCase()}`;
      let bucket = problemMap.get(key);
      if (!bucket) {
        bucket = {
          name: r.name,
          category: r.category,
          count: 0,
          orders: new Set(),
          revenue: 0,
        };
        problemMap.set(key, bucket);
      }
      bucket.count += 1;
      bucket.orders.add(r.orderId);
      bucket.revenue += r.price;
    }

    const totalCount = rows.length;
    const topProblems = Array.from(problemMap.values())
      .map((b) => ({
        name: b.name,
        category: b.category,
        count: b.count,
        ordersCount: b.orders.size,
        revenue: Math.round(b.revenue * 100) / 100,
        share: totalCount > 0 ? Math.round((b.count / totalCount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, limit);

    // По категориям (типам устройств)
    const categoryMap = new Map();
    for (const r of rows) {
      let bucket = categoryMap.get(r.category);
      if (!bucket) {
        bucket = { category: r.category, count: 0, orders: new Set(), revenue: 0, problems: new Map() };
        categoryMap.set(r.category, bucket);
      }
      bucket.count += 1;
      bucket.orders.add(r.orderId);
      bucket.revenue += r.price;
      const pk = r.name.toLowerCase();
      const pb = bucket.problems.get(pk) || { name: r.name, count: 0, revenue: 0 };
      pb.count += 1;
      pb.revenue += r.price;
      bucket.problems.set(pk, pb);
    }

    const byCategory = Array.from(categoryMap.values())
      .map((b) => {
        const topInCategory = Array.from(b.problems.values())
          .sort((a, c) => c.count - a.count || c.revenue - a.revenue)
          .slice(0, 5)
          .map((p) => ({
            name: p.name,
            count: p.count,
            revenue: Math.round(p.revenue * 100) / 100,
            share: b.count > 0 ? Math.round((p.count / b.count) * 1000) / 10 : 0,
          }));
        return {
          category: b.category,
          count: b.count,
          ordersCount: b.orders.size,
          revenue: Math.round(b.revenue * 100) / 100,
          share: totalCount > 0 ? Math.round((b.count / totalCount) * 1000) / 10 : 0,
          topProblems: topInCategory,
        };
      })
      .sort((a, b) => b.count - a.count);

    res.json({
      days: periodMode === 'all' ? 'all' : days,
      periodMode,
      fromDate,
      toDate,
      totalProblems: totalCount,
      totalOrders: ordersInPeriod.length,
      topProblems,
      byCategory,
    });
  } catch (error) {
    console.error('Ошибка сводки поломок:', error);
    res.status(500).json({ error: 'Ошибка загрузки сводки поломок' });
  }
});

module.exports = router;
