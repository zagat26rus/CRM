/**
 * Daily shop digest: repairs / stock / purchase hints.
 * Deploy to: /var/www/black-crm/back/src/routes/digest.js
 */
const express = require('express');
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const {
  getCompanySettings,
  normalizeDailyDigest,
} = require('../utils/companySettings');

function tableExists(database, name) {
  try {
    return Boolean(
      database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name),
    );
  } catch {
    return false;
  }
}

function buildDigest(database, companyId) {
  const settings = getCompanySettings(database, companyId);
  const cfg = normalizeDailyDigest(settings.dailyDigest);

  const repairs = {
    totalOpen: 0,
    byStatus: {},
    overdue: 0,
    ready: 0,
    newToday: 0,
    issuedToday: 0,
  };

  try {
    const openRows = database
      .prepare(
        `SELECT status, COUNT(*) as c FROM orders
         WHERE companyId = ? AND COALESCE(status,'') NOT IN (
           'Выдан','Выдано','Отменён','Отменен','Отмена',
           'Закрыт успешно','Закрыт не успешно','Закрыт','Отказ сервиса','Отказ клиента','Отказ'
         )
         GROUP BY status`,
      )
      .all(companyId);
    for (const r of openRows) {
      const st = r.status || 'Без статуса';
      repairs.byStatus[st] = r.c;
      repairs.totalOpen += r.c;
      if (String(st).toLowerCase().includes('готов')) repairs.ready += r.c;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.toISOString();

    repairs.newToday =
      database
        .prepare(`SELECT COUNT(*) as c FROM orders WHERE companyId = ? AND createdAt >= ?`)
        .get(companyId, ts)?.c || 0;

    repairs.issuedToday =
      database
        .prepare(
          `SELECT COUNT(*) as c FROM orders
           WHERE companyId = ?
             AND (
               LOWER(COALESCE(status,'')) LIKE 'выда%'
               OR LOWER(COALESCE(status,'')) LIKE 'закрыт%'
             )
             AND COALESCE(updatedAt, createdAt) >= ?`,
        )
        .get(companyId, ts)?.c || 0;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    repairs.overdue =
      database
        .prepare(
          `SELECT COUNT(*) as c FROM orders
           WHERE companyId = ? AND COALESCE(status,'') NOT IN (
             'Выдан','Выдано','Отменён','Отменен','Отмена',
             'Закрыт успешно','Закрыт не успешно','Закрыт','Отказ сервиса','Отказ клиента','Отказ','Готово','Готов'
           )
           AND createdAt < ?`,
        )
        .get(companyId, weekAgo)?.c || 0;
  } catch (e) {
    console.error('digest repairs', e.message);
  }

  const stock = {
    totalSkus: 0,
    totalQty: 0,
    lowStock: [],
    zeroStock: 0,
  };

  if (tableExists(database, 'inventory_items')) {
    try {
      const agg = database
        .prepare(
          `SELECT COUNT(*) as skus, COALESCE(SUM(quantity),0) as qty
           FROM inventory_items WHERE companyId = ?`,
        )
        .get(companyId);
      stock.totalSkus = agg?.skus || 0;
      stock.totalQty = agg?.qty || 0;

      stock.zeroStock =
        database
          .prepare(
            `SELECT COUNT(*) as c FROM inventory_items
             WHERE companyId = ? AND COALESCE(quantity,0) <= 0`,
          )
          .get(companyId)?.c || 0;

      stock.lowStock = database
        .prepare(
          `SELECT id, name, sku, quantity, purchasePrice, salePrice
           FROM inventory_items
           WHERE companyId = ? AND COALESCE(quantity,0) > 0 AND COALESCE(quantity,0) <= ?
           ORDER BY quantity ASC, name ASC
           LIMIT 25`,
        )
        .all(companyId, cfg.lowStockThreshold)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          purchasePrice: p.purchasePrice,
          salePrice: p.salePrice,
        }));
    } catch (e) {
      console.error('digest stock', e.message);
    }
  }

  const purchase = {
    waitingParts: 0,
    waitingList: [],
    hint: '',
  };

  try {
    const waiting = database
      .prepare(
        `SELECT id, documentNumber, client, brand, model, status, createdAt
         FROM orders
         WHERE companyId = ?
           AND (
             LOWER(COALESCE(status,'')) LIKE '%ожид%'
             OR LOWER(COALESCE(status,'')) LIKE '%ждёт%'
             OR LOWER(COALESCE(status,'')) LIKE '%ждет%'
             OR LOWER(COALESCE(status,'')) LIKE '%запчаст%'
           )
         ORDER BY createdAt DESC
         LIMIT 20`,
      )
      .all(companyId);
    purchase.waitingParts = waiting.length;
    purchase.waitingList = waiting.map((o) => ({
      id: o.id,
      documentNumber: o.documentNumber,
      client: o.client,
      device: [o.brand, o.model].filter(Boolean).join(' '),
      status: o.status,
      createdAt: o.createdAt,
    }));
  } catch (e) {
    console.error('digest purchase', e.message);
  }

  if (stock.lowStock.length) {
    purchase.hint = `На складе ${stock.lowStock.length} позиций с остатком ≤ ${cfg.lowStockThreshold}. Имеет смысл сверить закуп.`;
  } else if (purchase.waitingParts) {
    purchase.hint = `${purchase.waitingParts} ремонтов ждут запчасти — проверьте статусы закупа.`;
  } else {
    purchase.hint = 'Критичных сигналов по закупу нет.';
  }

  const generatedAt = Date.now();
  const summaryLines = [
    `Ремонты в работе: ${repairs.totalOpen} (готово к выдаче: ${repairs.ready})`,
    `Новых сегодня: ${repairs.newToday}, закрыто/выдано сегодня: ${repairs.issuedToday}, просрочка >7д: ${repairs.overdue}`,
    `Склад: ${stock.totalSkus} SKU, остаток ${stock.totalQty} шт., нулевых: ${stock.zeroStock}`,
    purchase.hint,
  ];

  return {
    enabled: cfg.enabled,
    config: cfg,
    generatedAt,
    repairs,
    stock,
    purchase,
    summary: summaryLines.join('\n'),
  };
}

const router = express.Router();
router.use(requireAuth);

router.get('/daily', (req, res) => {
  try {
    const digest = buildDigest(db, req.user.companyId);
    res.json(digest);
  } catch (e) {
    console.error('GET /api/digest/daily', e);
    res.status(500).json({ error: e.message || 'digest_failed' });
  }
});

module.exports = router;
module.exports.buildDigest = buildDigest;
