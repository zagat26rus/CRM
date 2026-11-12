const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { normalizePhone } = require('../utils/phone');

router.use(requireAuth);

// Функции для работы с клиентами (используются в других модулях)
function upsertClient(companyId, { name, phone, email } = {}) {
  const normalized = normalizePhone(phone);
  if (normalized) {
    const id = upsertClientByPhone(companyId, normalized, { name, email });
    try {
      recalcClientStatsByPhone(companyId, normalized);
    } catch {}
    return id;
  }

  const nm = String(name || '').trim() || 'Клиент';
  const now = getCurrentTime();
  const existing = db
    .prepare(
      `SELECT * FROM clients
       WHERE companyId = ? AND name = ? AND (phone IS NULL OR phone = '')
       ORDER BY id DESC LIMIT 1`
    )
    .get(companyId, nm);
  if (existing) {
    if (email && String(email).trim() && !existing.email) {
      db.prepare('UPDATE clients SET email = ?, updatedAt = ? WHERE id = ? AND companyId = ?').run(
        String(email).trim(),
        now,
        existing.id,
        companyId
      );
    }
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO clients (
      companyId, name, phone, email, notes, telegram, whatsapp,
      totalOrders, totalSpent, lastOrderDate,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, nm, '', String(email || '').trim(), '', '', '', 0, 0, null, now, now);
  return result.lastInsertRowid;
}

function upsertClientByPhone(companyId, phone, { name, email } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) return upsertClient(companyId, { name, phone: '', email });
  const now = getCurrentTime();
  const existing = db.prepare('SELECT * FROM clients WHERE companyId = ? AND phone = ?').get(companyId, normalized);
  if (existing) {
    const nextName = String(name || '').trim();
    const nextEmail = String(email || '').trim();
    // Не затираем существующие значения пустыми строками
    const finalName = nextName || existing.name || '';
    const finalEmail = nextEmail || existing.email || '';
    db.prepare(`
      UPDATE clients
      SET name = ?, email = ?, updatedAt = ?
      WHERE companyId = ? AND phone = ?
    `).run(finalName, finalEmail, now, companyId, normalized);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO clients (
      companyId, name, phone, email, notes, telegram, whatsapp,
      totalOrders, totalSpent, lastOrderDate,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    String(name || '').trim() || 'Клиент',
    normalized,
    String(email || '').trim(),
    '',
    '',
    '',
    0,
    0,
    null,
    now,
    now
  );
  return result.lastInsertRowid;
}

function recalcClientStatsByPhone(companyId, phone) {
  if (!phone) return;
  const now = getCurrentTime();

  // Если клиент ещё не создан (например, исторические заказы), создадим с именем из последнего заказа
  const existing = db.prepare('SELECT * FROM clients WHERE companyId = ? AND phone = ?').get(companyId, phone);
  if (!existing) {
    const lastOrder = db
      .prepare('SELECT client FROM orders WHERE companyId = ? AND phone = ? ORDER BY createdAt DESC, id DESC LIMIT 1')
      .get(companyId, phone);
    upsertClientByPhone(companyId, phone, { name: lastOrder?.client || 'Клиент', email: '' });
  }

  const agg = db.prepare(`
    SELECT
      COUNT(*) as totalOrders,
      SUM(CASE WHEN status IN ('Закрыт успешно', 'Закрыт') THEN price ELSE 0 END) as totalSpent,
      MAX(createdAt) as lastOrderDate
    FROM orders
    WHERE companyId = ? AND phone = ?
  `).get(companyId, phone);

  db.prepare(`
    UPDATE clients
    SET totalOrders = ?, totalSpent = ?, lastOrderDate = ?, updatedAt = ?
    WHERE companyId = ? AND phone = ?
  `).run(
    agg?.totalOrders || 0,
    agg?.totalSpent || 0,
    agg?.lastOrderDate || null,
    now,
    companyId,
    phone
  );
}

// Получение всех клиентов
router.get('/', (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    
    let conditions = ['companyId = ?'];
    let params = [req.user.companyId];
    
    if (search) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Общее количество
    const countSql = `SELECT COUNT(*) as total FROM clients ${whereClause}`;
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;
    
    // Данные
    const offset = (page - 1) * limit;
    const clients = db.prepare(`
      SELECT * FROM clients 
      ${whereClause}
      ORDER BY 
        CASE WHEN lastOrderDate IS NULL THEN 1 ELSE 0 END,
        lastOrderDate DESC,
        totalOrders DESC,
        name ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    // Получаем заказы клиентов для дополнительной информации
    const formattedClients = clients.map(client => {
      const orders = db.prepare(`
        SELECT id, status, price, createdAt 
        FROM orders 
        WHERE companyId = ? AND phone = ? 
        ORDER BY createdAt DESC 
        LIMIT 5
      `).all(req.user.companyId, client.phone);
      
      const activeOrders = orders.filter(o => 
        ['Новый', 'Диагностика', 'Ждет запчасти', 'В работе', 'Готов'].includes(o.status)
      );
      
      return {
        ...client,
        recentOrders: orders,
        activeOrdersCount: activeOrders.length,
        avgOrderValue: client.totalOrders > 0 ? client.totalSpent / client.totalOrders : 0
      };
    });
    
    res.json({
      clients: formattedClients,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения клиентов:', error);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
  }
});

// Создание клиента
router.post('/', (req, res) => {
  try {
    const { 
      name, 
      phone, 
      email = '', 
      notes = '',
      telegram = '',
      whatsapp = '',
      vk = ''
    } = req.body;
    
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите имя клиента' });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : '';
    if (normalizedPhone) {
      const existingClient = db
        .prepare('SELECT * FROM clients WHERE companyId = ? AND phone = ?')
        .get(req.user.companyId, normalizedPhone);
      if (existingClient) {
        return res.status(200).json(existingClient);
      }
    }
    
    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO clients (
        companyId, name, phone, email, notes, telegram, whatsapp, vk,
        totalOrders, totalSpent, lastOrderDate,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      req.user.companyId,
      String(name).trim(),
      normalizedPhone || '',
      email,
      notes,
      telegram,
      whatsapp,
      vk,
      0, // totalOrders
      0, // totalSpent
      null, // lastOrderDate
      now,
      now
    );
    
    const newClient = db.prepare('SELECT * FROM clients WHERE id = ? AND companyId = ?').get(result.lastInsertRowid, req.user.companyId);
    res.status(201).json(newClient);
  } catch (error) {
    console.error('Ошибка создания клиента:', error);
    res.status(500).json({ error: 'Ошибка создания клиента' });
  }
});

// Обновление клиента
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const existingClient = db.prepare('SELECT * FROM clients WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!existingClient) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    // Проверяем уникальность телефона
    if (updates.phone && updates.phone !== existingClient.phone) {
      const clientWithSamePhone = db
        .prepare('SELECT * FROM clients WHERE companyId = ? AND phone = ? AND id != ?')
        .get(req.user.companyId, updates.phone, id);
      if (clientWithSamePhone) {
        return res.status(400).json({ error: 'Клиент с таким телефоном уже существует' });
      }
    }
    
    const allowedFields = ['name', 'phone', 'email', 'notes', 'telegram', 'whatsapp', 'vk'];
    const fields = [];
    const params = [];
    const now = getCurrentTime();
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    
    fields.push('updatedAt = ?');
    params.push(now, id);
    
    const sql = `UPDATE clients SET ${fields.join(', ')} WHERE id = ? AND companyId = ?`;
    db.prepare(sql).run(...params, req.user.companyId);
    
    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    res.json(updatedClient);
  } catch (error) {
    console.error('Ошибка обновления клиента:', error);
    res.status(500).json({ error: 'Ошибка обновления клиента' });
  }
});

// Удаление клиента
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const stmt = db.prepare('DELETE FROM clients WHERE id = ? AND companyId = ?');
    const result = stmt.run(id, req.user.companyId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    res.json({ message: 'Клиент удален' });
  } catch (error) {
    console.error('Ошибка удаления клиента:', error);
    res.status(500).json({ error: 'Ошибка удаления клиента' });
  }
});

// Статистика по клиентам
router.get('/stats/summary', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalClients,
        SUM(totalOrders) as totalOrders,
        SUM(totalSpent) as totalRevenue,
        AVG(totalSpent) as avgClientValue,
        COUNT(CASE WHEN lastOrderDate > date('now', '-30 days') THEN 1 END) as activeLast30Days,
        COUNT(CASE WHEN lastOrderDate IS NULL THEN 1 END) as withoutOrders
      FROM clients
      WHERE companyId = ?
    `).get(req.user.companyId);
    
    res.json(stats);
  } catch (error) {
    console.error('Ошибка получения статистики клиентов:', error);
    res.status(500).json({ error: 'Ошибка получения статистики клиентов' });
  }
});

// Поиск клиента по телефону
router.get('/search/by-phone', (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ error: 'Укажите телефон для поиска' });
    }
    
    const clients = db.prepare(`
      SELECT * FROM clients 
      WHERE companyId = ? AND phone LIKE ?
      ORDER BY 
        CASE WHEN phone = ? THEN 0 ELSE 1 END,
        lastOrderDate DESC
      LIMIT 10
    `).all(req.user.companyId, `%${phone}%`, phone);
    
    res.json(clients);
  } catch (error) {
    console.error('Ошибка поиска клиента:', error);
    res.status(500).json({ error: 'Ошибка поиска клиента' });
  }
});

// Получение одного клиента
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    
    // Получаем историю заказов на ремонт клиента
    const repairOrders = db.prepare(`
      SELECT id, status, price, costPrice, problem, brand, model, deviceType, createdAt, updatedAt, 'repair' as type
      FROM orders 
      WHERE companyId = ? AND phone = ? 
      ORDER BY createdAt DESC
    `).all(req.user.companyId, client.phone);
    
    // Получаем историю заказов из магазина клиента
    const shopOrders = db.prepare(`
      SELECT id, orderNumber, status, paymentStatus, total as price, subtotal, deliveryCost, clientName, clientPhone, createdAt, updatedAt, 'shop' as type
      FROM shop_orders 
      WHERE companyId = ? AND clientPhone = ? 
      ORDER BY createdAt DESC
    `).all(req.user.companyId, client.phone);
    
    const formattedRepairOrders = repairOrders.map(order => ({
      ...order,
      warranty: Boolean(order.warranty),
      onSite: Boolean(order.onSite)
    }));
    
    const formattedShopOrders = shopOrders.map(order => ({
      ...order,
      price: Number(order.price) || 0,
      subtotal: Number(order.subtotal) || 0,
      deliveryCost: Number(order.deliveryCost) || 0
    }));
    
    // Объединяем все заказы
    const allOrders = [
      ...formattedRepairOrders.map(o => ({ ...o, type: 'repair' })),
      ...formattedShopOrders.map(o => ({ ...o, type: 'shop' }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    res.json({
      ...client,
      orders: allOrders,
      repairOrders: formattedRepairOrders,
      shopOrders: formattedShopOrders,
      totalOrdersCount: allOrders.length,
      activeOrders: formattedRepairOrders.filter(o => 
        ['Новый', 'Диагностика', 'Ждет запчасти', 'В работе'].includes(o.status)
      )
    });
  } catch (error) {
    console.error('Ошибка получения клиента:', error);
    res.status(500).json({ error: 'Ошибка получения клиента' });
  }
});

// Обновление статистики клиента при создании заказа
router.post('/:id/update-stats', (req, res) => {
  try {
    const { id } = req.params;
    const { orderAmount } = req.body;
    
    const now = getCurrentTime();
    db.prepare(`
      UPDATE clients 
      SET 
        totalOrders = totalOrders + 1,
        totalSpent = totalSpent + ?,
        lastOrderDate = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(orderAmount || 0, now, now, id, req.user.companyId);
    
    res.json({ message: 'Статистика обновлена' });
  } catch (error) {
    console.error('Ошибка обновления статистики:', error);
    res.status(500).json({ error: 'Ошибка обновления статистики' });
  }
});

// Экспортируем функции для использования в других модулях
module.exports = router;
module.exports.upsertClient = upsertClient;
module.exports.upsertClientByPhone = upsertClientByPhone;
module.exports.recalcClientStatsByPhone = recalcClientStatsByPhone;