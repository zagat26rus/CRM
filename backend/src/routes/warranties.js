const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { CLOSED_SUCCESS_STATUSES } = require('../constants/orderStatuses');

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const { expiringDays = 30, active } = req.query;
    const companyId = req.user.companyId;
    const days = Math.max(1, Math.min(Number(expiringDays) || 30, 365));
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    let sql = `
      SELECT id, client, phone, brand, model, problem, status, price, warranty, warrantyDays, warrantyEndsAt, createdAt, updatedAt
      FROM orders
      WHERE companyId = ?
        AND warrantyEndsAt IS NOT NULL
        AND warrantyEndsAt != ''
    `;
    const params = [companyId];

    if (active === '1' || active === 'true') {
      sql += ` AND warrantyEndsAt >= ?`;
      params.push(now.toISOString());
    }

    sql += ` ORDER BY warrantyEndsAt ASC LIMIT 200`;

    const rows = db.prepare(sql).all(...params).map((r) => ({
      ...r,
      warranty: Boolean(r.warranty),
      expiringSoon: r.warrantyEndsAt && r.warrantyEndsAt <= until && r.warrantyEndsAt >= now.toISOString(),
      expired: r.warrantyEndsAt && r.warrantyEndsAt < now.toISOString(),
    }));

    const stats = {
      active: rows.filter((r) => r.warrantyEndsAt >= now.toISOString()).length,
      expiringSoon: rows.filter((r) => r.expiringSoon).length,
      expired: rows.filter((r) => r.expired).length,
    };

    res.json({ warranties: rows, stats, expiringDays: days });
  } catch (e) {
    console.error('Ошибка реестра гарантий:', e);
    res.status(500).json({ error: 'Ошибка реестра гарантий' });
  }
});

module.exports = router;
