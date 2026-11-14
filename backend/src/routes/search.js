const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { normalizePhone } = require('../utils/phone');

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ orders: [], clients: [] });
    }

    const companyId = req.user.companyId;
    const like = `%${q}%`;
    const phoneDigits = normalizePhone(q);

    const orders = db
      .prepare(
        `
        SELECT id, client, phone, status, brand, model, problem, price, createdAt
        FROM orders
        WHERE companyId = ?
          AND (
            client LIKE ?
            OR phone LIKE ?
            OR CAST(id AS TEXT) = ?
            OR brand LIKE ?
            OR model LIKE ?
            OR problem LIKE ?
            OR documentNumber LIKE ?
            ${phoneDigits.length >= 5 ? 'OR phone LIKE ?' : ''}
          )
        ORDER BY createdAt DESC
        LIMIT 15
      `
      )
      .all(
        companyId,
        like,
        like,
        q,
        like,
        like,
        like,
        like,
        ...(phoneDigits.length >= 5 ? [`%${phoneDigits}%`] : [])
      );

    const clients = db
      .prepare(
        `
        SELECT id, name, phone, email, totalOrders, totalSpent
        FROM clients
        WHERE companyId = ?
          AND (name LIKE ? OR phone LIKE ? OR email LIKE ? ${phoneDigits.length >= 5 ? 'OR phone LIKE ?' : ''})
        ORDER BY totalOrders DESC, name ASC
        LIMIT 10
      `
      )
      .all(companyId, like, like, like, ...(phoneDigits.length >= 5 ? [`%${phoneDigits}%`] : []));

    res.json({ orders, clients });
  } catch (e) {
    console.error('Ошибка поиска:', e);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

module.exports = router;
