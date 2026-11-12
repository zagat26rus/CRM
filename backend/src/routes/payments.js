const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { requireFinance } = require('../middlewares/rbac');

router.use(requireAuth);

const PAYMENT_METHODS = {
  card: 'Карта',
  cash: 'Наличные',
  bank: 'Банковский перевод',
  online: 'Онлайн оплата',
};

function resolveMethodId(method) {
  const id = String(method || 'card').trim().toLowerCase();
  return PAYMENT_METHODS[id] ? id : 'card';
}

function formatMethodName(methodId) {
  return PAYMENT_METHODS[methodId] || PAYMENT_METHODS.card;
}

function formatPaymentRow(p) {
  const methodId = resolveMethodId(p.method);
  return {
    id: p.id,
    type: p.type === 'income' ? 'Приход' : 'Расход',
    method: formatMethodName(methodId),
    methodId,
    sum: p.amount,
    comment: p.description,
    createdAt: p.createdAt,
    date: p.date || p.createdAt,
    category: p.categoryName || 'Не указана',
    categoryIcon: p.categoryIcon || '',
    categoryId: p.categoryId || null,
    orderId: p.orderId || null,
  };
}

// Получение всех платежей
router.get('/', (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      type,
      method,
      from,
      to,
      q,
    } = req.query;

    const conditions = ['p.companyId = ?'];
    const params = [req.user.companyId];

    if (type === 'income' || type === 'Приход') {
      conditions.push('p.type = ?');
      params.push('income');
    } else if (type === 'expense' || type === 'Расход') {
      conditions.push('p.type = ?');
      params.push('expense');
    }

    if (method) {
      conditions.push('p.method = ?');
      params.push(resolveMethodId(method));
    }

    if (from) {
      conditions.push('(p.date >= ? OR p.createdAt >= ?)');
      params.push(String(from), String(from));
    }
    if (to) {
      conditions.push('(p.date <= ? OR p.createdAt <= ?)');
      params.push(String(to), String(to));
    }

    if (q && String(q).trim()) {
      conditions.push('p.description LIKE ?');
      params.push(`%${String(q).trim()}%`);
    }

    const where = conditions.join(' AND ');
    const totalResult = db.prepare(`SELECT COUNT(*) as total FROM payments p WHERE ${where}`).get(...params);
    const total = totalResult?.total || 0;

    const offset = (Number(page) - 1) * Number(limit);
    const payments = db
      .prepare(
        `
      SELECT 
        p.*,
        c.name as categoryName,
        c.icon as categoryIcon
      FROM payments p
      LEFT JOIN categories c ON p.categoryId = c.id
      WHERE ${where}
      ORDER BY p.date DESC, p.createdAt DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...params, Number(limit), offset);

    res.json({
      payments: payments.map(formatPaymentRow),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (error) {
    console.error('Ошибка получения платежей:', error);
    res.status(500).json({ error: 'Ошибка получения платежей' });
  }
});

// Создание платежа
router.post('/', requireFinance, (req, res) => {
  try {
    const { amount, type, description, categoryId, method, orderId, saleCategory } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Введите корректную сумму' });
    }
    if (!type || (type !== 'Приход' && type !== 'Расход')) {
      return res.status(400).json({ error: 'Тип должен быть "Приход" или "Расход"' });
    }

    const backendType = type === 'Приход' ? 'income' : 'expense';
    const methodId = resolveMethodId(method);

    let finalCategoryId = categoryId;
    if (!categoryId) {
      const defaultCategory = db
        .prepare(
          `
        SELECT id FROM categories 
        WHERE companyId = ? AND type = ? AND isActive = 1 
        ORDER BY isDefault DESC 
        LIMIT 1
      `
        )
        .get(req.user.companyId, backendType);

      finalCategoryId = defaultCategory ? defaultCategory.id : null;
    }

    let categoryName = 'Не указана';
    let categoryIcon = '';
    if (finalCategoryId) {
      const category = db.prepare('SELECT name, icon FROM categories WHERE id = ? AND companyId = ?').get(finalCategoryId, req.user.companyId);
      if (category) {
        categoryName = category.name;
        categoryIcon = category.icon || '';
      }
    }

    const now = getCurrentTime();
    const linkedOrderId = Number(orderId) > 0 ? Number(orderId) : null;
    const { isSaleCategory } = require('../constants/saleCategories');
    let resolvedSaleCategory = null;
    if (backendType === 'income') {
      if (isSaleCategory(saleCategory)) resolvedSaleCategory = saleCategory;
      else if (linkedOrderId) resolvedSaleCategory = 'repair';
      else resolvedSaleCategory = 'tech';
    }

    const result = db
      .prepare(
        `
      INSERT INTO payments 
      (companyId, amount, type, categoryId, description, date, orderId, saleCategory, method, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        req.user.companyId,
        Number(amount),
        backendType,
        finalCategoryId,
        description || type,
        now,
        linkedOrderId,
        resolvedSaleCategory,
        methodId,
        now,
        now
      );

    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND companyId = ?').get(result.lastInsertRowid, req.user.companyId);

    res.status(201).json({
      ...formatPaymentRow({ ...payment, categoryName, categoryIcon }),
    });
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    res.status(500).json({ error: 'Ошибка создания платежа' });
  }
});

// Обновление платежа
router.put('/:id', requireFinance, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM payments WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Платеж не найден' });

    const { amount, type, description, categoryId, method } = req.body || {};
    const fields = [];
    const params = [];

    if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Введите корректную сумму' });
      fields.push('amount = ?');
      params.push(n);
    }

    if (type !== undefined) {
      if (type !== 'Приход' && type !== 'Расход' && type !== 'income' && type !== 'expense') {
        return res.status(400).json({ error: 'Некорректный тип платежа' });
      }
      const backendType = type === 'Приход' || type === 'income' ? 'income' : 'expense';
      fields.push('type = ?');
      params.push(backendType);
    }

    if (description !== undefined) {
      fields.push('description = ?');
      params.push(String(description).trim().substring(0, 2000) || existing.description);
    }

    if (categoryId !== undefined) {
      fields.push('categoryId = ?');
      params.push(categoryId ? Number(categoryId) : null);
    }

    if (method !== undefined) {
      fields.push('method = ?');
      params.push(resolveMethodId(method));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    const now = getCurrentTime();
    fields.push('updatedAt = ?');
    params.push(now, id, req.user.companyId);

    db.prepare(`UPDATE payments SET ${fields.join(', ')} WHERE id = ? AND companyId = ?`).run(...params);

    const payment = db
      .prepare(
        `
      SELECT p.*, c.name as categoryName, c.icon as categoryIcon
      FROM payments p
      LEFT JOIN categories c ON p.categoryId = c.id
      WHERE p.id = ? AND p.companyId = ?
    `
      )
      .get(id, req.user.companyId);

    res.json(formatPaymentRow(payment));
  } catch (error) {
    console.error('Ошибка обновления платежа:', error);
    res.status(500).json({ error: 'Ошибка обновления платежа' });
  }
});

// Удаление платежа
router.delete('/:id', requireFinance, (req, res) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM payments WHERE id = ? AND companyId = ?').run(id, req.user.companyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Платеж не найден' });
    }

    res.json({ message: 'Платеж удален' });
  } catch (error) {
    console.error('Ошибка удаления платежа:', error);
    res.status(500).json({ error: 'Ошибка удаления платежа' });
  }
});

// Статистика платежей
router.get('/stats', (req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT 
        type,
        SUM(amount) as total,
        COUNT(*) as count
      FROM payments
      WHERE companyId = ?
      GROUP BY type
    `
      )
      .all(req.user.companyId);

    const income = stats.find((s) => s.type === 'income')?.total || 0;
    const expense = stats.find((s) => s.type === 'expense')?.total || 0;

    res.json({
      income,
      expense,
      balance: income - expense,
      incomeCount: stats.find((s) => s.type === 'income')?.count || 0,
      expenseCount: stats.find((s) => s.type === 'expense')?.count || 0,
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Баланс
router.get('/balance', (req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT 
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM payments
      WHERE companyId = ?
    `
      )
      .get(req.user.companyId);

    const income = stats.income || 0;
    const expense = stats.expense || 0;

    res.json({
      balance: income - expense,
      income,
      expense,
    });
  } catch (error) {
    console.error('Ошибка получения баланса:', error);
    res.status(500).json({ error: 'Ошибка получения баланса' });
  }
});

module.exports = router;
