const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function calcOrderCostEstimate(companyId, items) {
  let total = 0;
  for (const item of items) {
    let inventoryItemId = toInt(item.inventoryItemId, 0);
    if (!inventoryItemId) {
      const productId = toInt(item.productId, 0);
      if (productId) {
        const product = db
          .prepare('SELECT inventoryItemId FROM shop_products WHERE id = ? AND companyId = ?')
          .get(productId, companyId);
        inventoryItemId = toInt(product?.inventoryItemId, 0);
      }
    }
    if (!inventoryItemId) {
      // себестоимость могла быть сохранена в строке заказа
      if (item.purchasePrice !== undefined) {
        total += toNumber(item.purchasePrice, 0) * toInt(item.quantity, 0);
      }
      continue;
    }
    const inv = db
      .prepare('SELECT purchasePrice FROM inventory_items WHERE id = ? AND companyId = ?')
      .get(inventoryItemId, companyId);
    if (!inv) continue;
    total += toNumber(inv.purchasePrice, 0) * toInt(item.quantity, 0);
  }
  return Math.round(total * 100) / 100;
}

function mapShopOrder(order, companyId) {
  const items = order.items ? JSON.parse(order.items) : [];
  return {
    ...order,
    subtotal: toNumber(order.subtotal, 0),
    deliveryCost: toNumber(order.deliveryCost, 0),
    total: toNumber(order.total, 0),
    items,
    estimatedCost: calcOrderCostEstimate(companyId, items),
  };
}

// Создать или получить категорию для продаж из магазина
function ensureShopSalesCategoryId(companyId) {
  const existing = db
    .prepare("SELECT id FROM categories WHERE companyId = ? AND name = ? AND type = 'income'")
    .get(companyId, 'Продажа из магазина');

  if (existing?.id) return existing.id;

  const now = getCurrentTime();
  const result = db
    .prepare(`
      INSERT INTO categories (companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
      VALUES (?, 'Продажа из магазина', 'income', 'Продажи товаров из магазина', '#10b981', '💰', 1, 0, ?, ?)
    `)
    .run(companyId, now, now);
  return result.lastInsertRowid;
}

// ========== КАТЕГОРИИ ==========

// Список категорий
router.get('/categories', (req, res) => {
  try {
    const categories = db
      .prepare('SELECT * FROM shop_categories WHERE companyId = ? ORDER BY sortOrder ASC, name ASC')
      .all(req.user.companyId);
    res.json(categories);
  } catch (error) {
    console.error('Ошибка получения категорий магазина:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Создать категорию
router.post('/categories', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { name, description = '', imageUrl = '', sortOrder = 0 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }
    const now = getCurrentTime();
    const existing = db
      .prepare('SELECT id FROM shop_categories WHERE companyId = ? AND LOWER(name) = LOWER(?)')
      .get(req.user.companyId, name.trim());
    if (existing) {
      return res.status(400).json({ error: 'Категория с таким названием уже существует' });
    }
    const result = db
      .prepare(`
        INSERT INTO shop_categories (companyId, name, description, imageUrl, sortOrder, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(req.user.companyId, name.trim(), String(description || ''), String(imageUrl || ''), toInt(sortOrder, 0), now, now);
    const category = db.prepare('SELECT * FROM shop_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (error) {
    console.error('Ошибка создания категории:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Обновить категорию
router.put('/categories/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, sortOrder, isActive } = req.body;
    const category = db.prepare('SELECT * FROM shop_categories WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!category) return res.status(404).json({ error: 'Категория не найдена' });
    const now = getCurrentTime();
    db.prepare(`
      UPDATE shop_categories
      SET name = ?, description = ?, imageUrl = ?, sortOrder = ?, isActive = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name ? String(name).trim() : category.name,
      description !== undefined ? String(description) : category.description,
      imageUrl !== undefined ? String(imageUrl) : category.imageUrl,
      sortOrder !== undefined ? toInt(sortOrder, 0) : category.sortOrder,
      isActive !== undefined ? (isActive ? 1 : 0) : category.isActive,
      now,
      id,
      req.user.companyId
    );
    const updated = db.prepare('SELECT * FROM shop_categories WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Ошибка обновления категории:', error);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

// Удалить категорию
router.delete('/categories/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const category = db.prepare('SELECT * FROM shop_categories WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!category) return res.status(404).json({ error: 'Категория не найдена' });
    const productsCount = db.prepare('SELECT COUNT(*) as count FROM shop_products WHERE categoryId = ?').get(id).count;
    if (productsCount > 0) {
      return res.status(400).json({ error: 'Нельзя удалить категорию, в которой есть товары' });
    }
    db.prepare('DELETE FROM shop_categories WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления категории:', error);
    res.status(500).json({ error: 'Ошибка удаления категории' });
  }
});

// ========== ТОВАРЫ ==========

// Список товаров
router.get('/products', (req, res) => {
  try {
    const { search = '', categoryId = '', isActive = '' } = req.query;
    const q = String(search || '').trim();
    const catId = categoryId ? toInt(categoryId) : null;
    const active = isActive !== '' ? (isActive === 'true' || isActive === '1') : null;

    let query = `
      SELECT 
        p.*,
        c.name as categoryName,
        i.name as inventoryItemName,
        i.quantity as inventoryQuantity
      FROM shop_products p
      LEFT JOIN shop_categories c ON c.id = p.categoryId AND c.companyId = p.companyId
      LEFT JOIN inventory_items i ON i.id = p.inventoryItemId AND i.companyId = p.companyId
      WHERE p.companyId = ?
    `;
    const params = [req.user.companyId];

    if (q) {
      query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (catId !== null) {
      query += ` AND p.categoryId = ?`;
      params.push(catId);
    }
    if (active !== null) {
      query += ` AND p.isActive = ?`;
      params.push(active ? 1 : 0);
    }

    query += ` ORDER BY p.sortOrder ASC, p.name ASC`;

    const products = db.prepare(query).all(...params);
    res.json(products.map(p => ({
      ...p,
      price: toNumber(p.price, 0),
      compareAtPrice: p.compareAtPrice ? toNumber(p.compareAtPrice, 0) : null,
      stockQuantity: toInt(p.stockQuantity, 0),
      categoryId: p.categoryId ? toInt(p.categoryId) : null,
      inventoryItemId: p.inventoryItemId ? toInt(p.inventoryItemId) : null,
      trackInventory: p.trackInventory === 1,
      isActive: p.isActive === 1,
      isFeatured: p.isFeatured === 1,
      sortOrder: toInt(p.sortOrder, 0),
      images: p.images ? JSON.parse(p.images) : []
    })));
  } catch (error) {
    console.error('Ошибка получения товаров магазина:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// Получить товар по ID
router.get('/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const product = db
      .prepare(`
        SELECT 
          p.*,
          c.name as categoryName,
          i.name as inventoryItemName,
          i.quantity as inventoryQuantity
        FROM shop_products p
        LEFT JOIN shop_categories c ON c.id = p.categoryId AND c.companyId = p.companyId
        LEFT JOIN inventory_items i ON i.id = p.inventoryItemId AND i.companyId = p.companyId
        WHERE p.id = ? AND p.companyId = ?
      `)
      .get(id, req.user.companyId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json({
      ...product,
      price: toNumber(product.price, 0),
      compareAtPrice: product.compareAtPrice ? toNumber(product.compareAtPrice, 0) : null,
      stockQuantity: toInt(product.stockQuantity, 0),
      categoryId: product.categoryId ? toInt(product.categoryId) : null,
      inventoryItemId: product.inventoryItemId ? toInt(product.inventoryItemId) : null,
      trackInventory: product.trackInventory === 1,
      isActive: product.isActive === 1,
      isFeatured: product.isFeatured === 1,
      sortOrder: toInt(product.sortOrder, 0),
      images: product.images ? JSON.parse(product.images) : []
    });
  } catch (error) {
    console.error('Ошибка получения товара:', error);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

// Создать товар
router.post('/products', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const {
      name,
      description = '',
      sku = '',
      categoryId = null,
      inventoryItemId = null,
      price,
      compareAtPrice = null,
      imageUrl = '',
      images = [],
      stockQuantity = 0,
      trackInventory = true,
      isActive = true,
      isFeatured = false,
      sortOrder = 0,
      seoTitle = '',
      seoDescription = ''
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }
    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Цена обязательна' });
    }
    const priceNum = toNumber(price, 0);
    if (priceNum < 0) {
      return res.status(400).json({ error: 'Цена не может быть отрицательной' });
    }

    const now = getCurrentTime();
    const result = db
      .prepare(`
        INSERT INTO shop_products (
          companyId, categoryId, inventoryItemId, name, description, sku, price, compareAtPrice,
          imageUrl, images, stockQuantity, trackInventory, isActive, isFeatured, sortOrder,
          seoTitle, seoDescription, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        req.user.companyId,
        categoryId ? toInt(categoryId) : null,
        inventoryItemId ? toInt(inventoryItemId) : null,
        name.trim(),
        String(description || ''),
        String(sku || ''),
        priceNum,
        compareAtPrice !== null && compareAtPrice !== undefined ? toNumber(compareAtPrice, 0) : null,
        String(imageUrl || ''),
        JSON.stringify(Array.isArray(images) ? images : []),
        toInt(stockQuantity, 0),
        trackInventory ? 1 : 0,
        isActive ? 1 : 0,
        isFeatured ? 1 : 0,
        toInt(sortOrder, 0),
        String(seoTitle || ''),
        String(seoDescription || ''),
        now,
        now
      );

    const product = db
      .prepare(`
        SELECT 
          p.*,
          c.name as categoryName,
          i.name as inventoryItemName,
          i.quantity as inventoryQuantity
        FROM shop_products p
        LEFT JOIN shop_categories c ON c.id = p.categoryId AND c.companyId = p.companyId
        LEFT JOIN inventory_items i ON i.id = p.inventoryItemId AND i.companyId = p.companyId
        WHERE p.id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json({
      ...product,
      price: toNumber(product.price, 0),
      compareAtPrice: product.compareAtPrice ? toNumber(product.compareAtPrice, 0) : null,
      stockQuantity: toInt(product.stockQuantity, 0),
      categoryId: product.categoryId ? toInt(product.categoryId) : null,
      inventoryItemId: product.inventoryItemId ? toInt(product.inventoryItemId) : null,
      trackInventory: product.trackInventory === 1,
      isActive: product.isActive === 1,
      isFeatured: product.isFeatured === 1,
      sortOrder: toInt(product.sortOrder, 0),
      images: product.images ? JSON.parse(product.images) : []
    });
  } catch (error) {
    console.error('Ошибка создания товара:', error);
    res.status(500).json({ error: 'Ошибка создания товара' });
  }
});

// Обновить товар
router.put('/products/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT * FROM shop_products WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const {
      name,
      description,
      sku,
      categoryId,
      inventoryItemId,
      price,
      compareAtPrice,
      imageUrl,
      images,
      stockQuantity,
      trackInventory,
      isActive,
      isFeatured,
      sortOrder,
      seoTitle,
      seoDescription
    } = req.body;

    const now = getCurrentTime();
    db.prepare(`
      UPDATE shop_products
      SET 
        name = ?,
        description = ?,
        sku = ?,
        categoryId = ?,
        inventoryItemId = ?,
        price = ?,
        compareAtPrice = ?,
        imageUrl = ?,
        images = ?,
        stockQuantity = ?,
        trackInventory = ?,
        isActive = ?,
        isFeatured = ?,
        sortOrder = ?,
        seoTitle = ?,
        seoDescription = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name !== undefined ? String(name).trim() : product.name,
      description !== undefined ? String(description) : product.description,
      sku !== undefined ? String(sku) : product.sku,
      categoryId !== undefined ? (categoryId ? toInt(categoryId) : null) : product.categoryId,
      inventoryItemId !== undefined ? (inventoryItemId ? toInt(inventoryItemId) : null) : product.inventoryItemId,
      price !== undefined ? toNumber(price, 0) : product.price,
      compareAtPrice !== undefined ? (compareAtPrice !== null ? toNumber(compareAtPrice, 0) : null) : product.compareAtPrice,
      imageUrl !== undefined ? String(imageUrl) : product.imageUrl,
      images !== undefined ? JSON.stringify(Array.isArray(images) ? images : []) : product.images,
      stockQuantity !== undefined ? toInt(stockQuantity, 0) : product.stockQuantity,
      trackInventory !== undefined ? (trackInventory ? 1 : 0) : product.trackInventory,
      isActive !== undefined ? (isActive ? 1 : 0) : product.isActive,
      isFeatured !== undefined ? (isFeatured ? 1 : 0) : product.isFeatured,
      sortOrder !== undefined ? toInt(sortOrder, 0) : product.sortOrder,
      seoTitle !== undefined ? String(seoTitle) : product.seoTitle,
      seoDescription !== undefined ? String(seoDescription) : product.seoDescription,
      now,
      id,
      req.user.companyId
    );

    const updated = db
      .prepare(`
        SELECT 
          p.*,
          c.name as categoryName,
          i.name as inventoryItemName,
          i.quantity as inventoryQuantity
        FROM shop_products p
        LEFT JOIN shop_categories c ON c.id = p.categoryId AND c.companyId = p.companyId
        LEFT JOIN inventory_items i ON i.id = p.inventoryItemId AND i.companyId = p.companyId
        WHERE p.id = ?
      `)
      .get(id);

    res.json({
      ...updated,
      price: toNumber(updated.price, 0),
      compareAtPrice: updated.compareAtPrice ? toNumber(updated.compareAtPrice, 0) : null,
      stockQuantity: toInt(updated.stockQuantity, 0),
      categoryId: updated.categoryId ? toInt(updated.categoryId) : null,
      inventoryItemId: updated.inventoryItemId ? toInt(updated.inventoryItemId) : null,
      trackInventory: updated.trackInventory === 1,
      isActive: updated.isActive === 1,
      isFeatured: updated.isFeatured === 1,
      sortOrder: toInt(updated.sortOrder, 0),
      images: updated.images ? JSON.parse(updated.images) : []
    });
  } catch (error) {
    console.error('Ошибка обновления товара:', error);
    res.status(500).json({ error: 'Ошибка обновления товара' });
  }
});

// Удалить товар
router.delete('/products/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT * FROM shop_products WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    db.prepare('DELETE FROM shop_products WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// ========== ЗАКАЗЫ ==========

// Список заказов
router.get('/orders', (req, res) => {
  try {
    const { status = '', search = '' } = req.query;
    const statusFilter = String(status || '').trim();
    const searchQuery = String(search || '').trim();

    let query = 'SELECT * FROM shop_orders WHERE companyId = ?';
    const params = [req.user.companyId];

    if (statusFilter) {
      query += ' AND status = ?';
      params.push(statusFilter);
    }
    if (searchQuery) {
      query += ' AND (orderNumber LIKE ? OR clientName LIKE ? OR clientPhone LIKE ? OR clientEmail LIKE ?)';
      const searchPattern = `%${searchQuery}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY createdAt DESC';

    const orders = db.prepare(query).all(...params);
    res.json(orders.map(o => mapShopOrder(o, req.user.companyId)));
  } catch (error) {
    console.error('Ошибка получения заказов магазина:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Создать заказ
router.post('/orders', (req, res) => {
  try {
    const {
      clientName,
      clientPhone,
      clientEmail = '',
      clientAddress = '',
      paymentMethod = 'cash',
      deliveryMethod = 'pickup',
      deliveryCost = 0,
      notes = '',
      items = []
    } = req.body;

    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'Имя клиента обязательно' });
    }
    if (!clientPhone || !clientPhone.trim()) {
      return res.status(400).json({ error: 'Телефон клиента обязателен' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Добавьте хотя бы один товар' });
    }

    // Вычисляем суммы
    const subtotal = items.reduce((sum, item) => {
      const price = toNumber(item.price, 0);
      const quantity = toInt(item.quantity, 1);
      return sum + (price * quantity);
    }, 0);
    const delivery = toNumber(deliveryCost, 0);
    const total = subtotal + delivery;

    // Генерируем номер заказа
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM shop_orders WHERE companyId = ?').get(req.user.companyId).count || 0;
    const orderNumber = `ORD-${String(orderCount + 1).padStart(6, '0')}`;

    const now = getCurrentTime();
    const result = db
      .prepare(`
        INSERT INTO shop_orders (
          companyId, orderNumber, clientName, clientPhone, clientEmail, clientAddress,
          status, paymentStatus, paymentMethod, deliveryMethod,
          subtotal, deliveryCost, total, notes, items, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, 'new', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        req.user.companyId,
        orderNumber,
        String(clientName).trim(),
        String(clientPhone).trim(),
        String(clientEmail).trim(),
        String(clientAddress).trim(),
        String(paymentMethod),
        String(deliveryMethod),
        subtotal,
        delivery,
        total,
        String(notes).trim(),
        JSON.stringify(items),
        now,
        now
      );

    // Интегрируем клиента в общий пул при создании заказа
    try {
      const { upsertClientByPhone } = require('./clients');
      upsertClientByPhone(req.user.companyId, String(clientPhone).trim(), { 
        name: String(clientName).trim(), 
        email: String(clientEmail).trim() 
      });
    } catch (e) {
      console.error('Ошибка интеграции клиента при создании заказа:', e);
    }

    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...order,
      subtotal: toNumber(order.subtotal, 0),
      deliveryCost: toNumber(order.deliveryCost, 0),
      total: toNumber(order.total, 0),
      items: order.items ? JSON.parse(order.items) : []
    });
  } catch (error) {
    console.error('Ошибка создания заказа:', error);
    res.status(500).json({ error: 'Ошибка создания заказа' });
  }
});

// Получить заказ по ID
router.get('/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    res.json(mapShopOrder(order, req.user.companyId));
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// Обновить статус заказа
router.put('/orders/:id/status', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;
    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const now = getCurrentTime();
    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (paymentStatus !== undefined) {
      updates.push('paymentStatus = ?');
      params.push(paymentStatus);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Не указан статус для обновления' });
    }

    updates.push('updatedAt = ?');
    params.push(now, id, req.user.companyId);

    db.prepare(`UPDATE shop_orders SET ${updates.join(', ')} WHERE id = ? AND companyId = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(id);
    res.json({
      ...updated,
      subtotal: toNumber(updated.subtotal, 0),
      deliveryCost: toNumber(updated.deliveryCost, 0),
      total: toNumber(updated.total, 0),
      items: updated.items ? JSON.parse(updated.items) : []
    });
  } catch (error) {
    console.error('Ошибка обновления заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления заказа' });
  }
});

// Продать заказ (создать платеж и обновить статус)
router.post('/orders/:id/sell', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'delivered', paymentMethod = 'card', printInvoice = false, costTotal } = req.body;
    
    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Заказ уже оплачен' });
    }

    const items = order.items ? JSON.parse(order.items) : [];
    const cost = costTotal !== undefined
      ? Math.max(0, toNumber(costTotal, 0))
      : calcOrderCostEstimate(req.user.companyId, items);
    const now = getCurrentTime();

    const tx = db.transaction(() => {
      // 1) Создать платеж
      const categoryId = ensureShopSalesCategoryId(req.user.companyId);
      const description = `Продажа из магазина: Заказ ${order.orderNumber}${order.clientName ? ` (${order.clientName})` : ''}`;

      const paymentResult = db
        .prepare(`
          INSERT INTO payments (companyId, amount, type, categoryId, description, date, saleCategory, method, createdAt, updatedAt)
          VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(req.user.companyId, order.total, categoryId, description, now, 'tech', String(paymentMethod || 'card'), now, now);

      if (cost > 0) {
        db.prepare(`
          INSERT INTO payments (companyId, amount, type, description, date, method, createdAt, updatedAt)
          VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
        `).run(
          req.user.companyId,
          cost,
          `Себестоимость: ${description}`,
          now,
          String(paymentMethod || 'card'),
          now,
          now
        );
      }

      // 2) Обновить статус заказа
      db.prepare(`
        UPDATE shop_orders 
        SET status = ?, paymentStatus = 'paid', paymentMethod = ?, updatedAt = ?
        WHERE id = ? AND companyId = ?
      `).run(status, paymentMethod, now, id, req.user.companyId);

      // 3) Уменьшить остатки на складе
      for (const item of items) {
        let inventoryItemId = toInt(item.inventoryItemId, 0);
        if (!inventoryItemId && item.productId) {
          const product = db
            .prepare('SELECT inventoryItemId FROM shop_products WHERE id = ? AND companyId = ?')
            .get(item.productId, req.user.companyId);
          inventoryItemId = toInt(product?.inventoryItemId, 0);
        }
        if (!inventoryItemId) continue;
        const qty = toInt(item.quantity, 0);
        const inventoryItem = db
          .prepare('SELECT quantity FROM inventory_items WHERE id = ? AND companyId = ?')
          .get(inventoryItemId, req.user.companyId);
        if (!inventoryItem || toInt(inventoryItem.quantity, 0) < qty) {
          throw new Error(`Недостаточно товара на складе (id=${inventoryItemId})`);
        }
        db.prepare(
          'UPDATE inventory_items SET quantity = quantity - ?, updatedAt = ? WHERE id = ? AND companyId = ?'
        ).run(qty, now, inventoryItemId, req.user.companyId);
      }

      // 4) Интегрировать клиента из магазина в общий пул клиентов
      try {
        const { upsertClientByPhone, recalcClientStatsByPhone } = require('./clients');
        upsertClientByPhone(req.user.companyId, order.clientPhone, { 
          name: order.clientName, 
          email: order.clientEmail || '' 
        });
        recalcClientStatsByPhone(req.user.companyId, order.clientPhone);
      } catch (e) {
        console.error('Ошибка интеграции клиента:', e);
      }

      return {
        paymentId: paymentResult.lastInsertRowid,
        orderId: id
      };
    });

    const result = tx();
    const updatedOrder = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(id);
    
    res.json({
      success: true,
      order: {
        ...updatedOrder,
        subtotal: toNumber(updatedOrder.subtotal, 0),
        deliveryCost: toNumber(updatedOrder.deliveryCost, 0),
        total: toNumber(updatedOrder.total, 0),
        items: updatedOrder.items ? JSON.parse(updatedOrder.items) : []
      },
      paymentId: result.paymentId,
      printInvoice
    });
  } catch (error) {
    console.error('Ошибка продажи заказа:', error);
    res.status(500).json({ error: 'Ошибка продажи заказа' });
  }
});

// Получить данные для накладной
router.get('/orders/:id/invoice', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.companyId);
    const items = order.items ? JSON.parse(order.items) : [];

    res.json({
      order: {
        ...order,
        subtotal: toNumber(order.subtotal, 0),
        deliveryCost: toNumber(order.deliveryCost, 0),
        total: toNumber(order.total, 0),
        items
      },
      company: {
        name: company?.name || '',
        address: company?.address || '',
        phone: company?.phone || '',
        email: company?.email || '',
        inn: company?.inn || '',
        kpp: company?.kpp || ''
      },
      invoiceDate: getCurrentTime()
    });
  } catch (error) {
    console.error('Ошибка получения накладной:', error);
    res.status(500).json({ error: 'Ошибка получения накладной' });
  }
});

// ========== СТАТИСТИКА ==========

// Статистика магазина
router.get('/stats', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [req.user.companyId];

    if (startDate && endDate) {
      dateFilter = ' AND createdAt >= ? AND createdAt <= ?';
      params.push(startDate, endDate);
    }

    // Общая статистика
    const totalOrders = db.prepare(`SELECT COUNT(*) as count FROM shop_orders WHERE companyId = ? ${dateFilter}`).get(...params).count;
    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM shop_orders WHERE companyId = ? AND paymentStatus = 'paid' ${dateFilter}`).get(...params).total || 0;
    // Каталог = позиции склада с остатком > 0
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE companyId = ?').get(req.user.companyId).count;
    const activeProducts = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE companyId = ? AND quantity > 0').get(req.user.companyId).count;

    // Статистика по статусам
    const ordersByStatus = db
      .prepare(`SELECT status, COUNT(*) as count FROM shop_orders WHERE companyId = ? ${dateFilter} GROUP BY status`)
      .all(...params)
      .reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {});

    // Популярные позиции склада
    const allProducts = db
      .prepare(`
        SELECT id, name, salePrice as price
        FROM inventory_items
        WHERE companyId = ? AND quantity > 0
        ORDER BY quantity DESC, name ASC
        LIMIT 10
      `)
      .all(req.user.companyId);

    res.json({
      totalOrders: toInt(totalOrders, 0),
      totalRevenue: toNumber(totalRevenue, 0),
      totalProducts: toInt(totalProducts, 0),
      activeProducts: toInt(activeProducts, 0),
      ordersByStatus,
      popularProducts: allProducts.map(p => ({
        id: p.id,
        name: p.name,
        price: toNumber(p.price, 0)
      }))
    });
  } catch (error) {
    console.error('Ошибка получения статистики магазина:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// ========== ПРОДАЖА СО СКЛАДА (POS) ==========

function ensureInventorySalesColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(inventory_sales)`).all().map((c) => c.name);
    if (!cols.includes('customer')) {
      db.exec(`ALTER TABLE inventory_sales ADD COLUMN customer TEXT DEFAULT ''`);
    }
    if (!cols.includes('shopOrderId')) {
      db.exec(`ALTER TABLE inventory_sales ADD COLUMN shopOrderId INTEGER DEFAULT NULL`);
    }
  } catch (e) {
    console.error('ensureInventorySalesColumns:', e);
  }
}

// Каталог для магазина = склад (категории склада)
router.get('/catalog', (req, res) => {
  try {
    const { search = '', categoryId = '', inStock = '1' } = req.query;
    const q = String(search || '').trim();
    const catId = categoryId ? toInt(categoryId) : null;
    const onlyInStock = !(inStock === '0' || inStock === 'false');

    let query = `
      SELECT
        i.*,
        c.name as categoryName,
        w.name as warehouseName
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
      LEFT JOIN inventory_warehouses w ON w.id = i.warehouseId AND w.companyId = i.companyId
      WHERE i.companyId = ?
    `;
    const params = [req.user.companyId];

    if (onlyInStock) {
      query += ' AND i.quantity > 0';
    }
    if (q) {
      query += ' AND (i.name LIKE ? OR i.sku LIKE ? OR i.description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (catId !== null) {
      query += ' AND i.categoryId = ?';
      params.push(catId);
    }
    query += ' ORDER BY c.name ASC, i.name ASC';

    const rows = db.prepare(query).all(...params);
    res.json(rows.map((i) => ({
      ...i,
      purchasePrice: toNumber(i.purchasePrice, 0),
      salePrice: toNumber(i.salePrice, 0),
      quantity: toInt(i.quantity, 0),
      categoryId: i.categoryId != null ? toInt(i.categoryId, 0) : null,
    })));
  } catch (error) {
    console.error('Ошибка каталога магазина:', error);
    res.status(500).json({ error: 'Ошибка получения каталога' });
  }
});

// Категории для фильтра магазина = категории склада
router.get('/inventory-categories', (req, res) => {
  try {
    const categories = db
      .prepare(`
        SELECT * FROM inventory_categories
        WHERE companyId = ? AND (isActive = 1 OR isActive IS NULL)
        ORDER BY name ASC
      `)
      .all(req.user.companyId);
    res.json(categories.map((c) => ({
      ...c,
      isActive: c.isActive === undefined || c.isActive === null ? true : Boolean(c.isActive),
    })));
  } catch (error) {
    console.error('Ошибка категорий склада для магазина:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Провести реализацию: списать со склада + платежи + заказ/накладная
router.post('/sales', requireRole(['owner', 'admin', 'director']), (req, res) => {
  try {
    ensureInventorySalesColumns();

    const {
      clientName = 'Розничный покупатель',
      clientPhone = '',
      clientEmail = '',
      clientAddress = '',
      notes = '',
      paymentMethod = 'cash',
      saleCategory = 'tech',
      items = [],
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Добавьте хотя бы один товар со склада' });
    }

    const { isSaleCategory } = require('../constants/saleCategories');
    const resolvedSaleCategory = isSaleCategory(saleCategory) ? saleCategory : 'tech';
    const payMethod = String(paymentMethod || 'cash');
    const now = getCurrentTime();
    const companyId = req.user.companyId;

    // Нормализуем и проверяем позиции до транзакции
    const lines = [];
    for (const raw of items) {
      const itemId = toInt(raw.itemId ?? raw.inventoryItemId, 0);
      const quantity = toInt(raw.quantity, 0);
      if (!itemId || quantity <= 0) {
        return res.status(400).json({ error: 'Некорректная позиция: нужен itemId и quantity > 0' });
      }
      const inv = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND companyId = ?').get(itemId, companyId);
      if (!inv) return res.status(404).json({ error: `Товар #${itemId} не найден на складе` });
      if (toInt(inv.quantity, 0) < quantity) {
        return res.status(400).json({
          error: `Недостаточно «${inv.name}»: есть ${inv.quantity}, нужно ${quantity}`,
        });
      }
      const price = raw.price !== undefined && raw.price !== null && String(raw.price).trim() !== ''
        ? toNumber(raw.price, 0)
        : toNumber(inv.salePrice, 0);
      if (price < 0) return res.status(400).json({ error: 'Цена не может быть отрицательной' });
      const lineTotal = Math.round(price * quantity * 100) / 100;
      const lineCost = Math.round(toNumber(inv.purchasePrice, 0) * quantity * 100) / 100;
      lines.push({
        itemId,
        name: inv.name,
        sku: inv.sku || '',
        quantity,
        price,
        purchasePrice: toNumber(inv.purchasePrice, 0),
        lineTotal,
        lineCost,
        categoryName: null,
      });
    }

    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const costTotal = Math.round(lines.reduce((s, l) => s + l.lineCost, 0) * 100) / 100;
    const total = subtotal;

    const result = db.transaction(() => {
      const orderCount = db.prepare('SELECT COUNT(*) as count FROM shop_orders WHERE companyId = ?').get(companyId).count || 0;
      const orderNumber = `SALE-${String(orderCount + 1).padStart(6, '0')}`;

      const orderItems = lines.map((l) => ({
        productId: 0,
        inventoryItemId: l.itemId,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        price: l.price,
        purchasePrice: l.purchasePrice,
      }));

      const orderResult = db.prepare(`
        INSERT INTO shop_orders (
          companyId, orderNumber, clientName, clientPhone, clientEmail, clientAddress,
          status, paymentStatus, paymentMethod, deliveryMethod,
          subtotal, deliveryCost, total, notes, items, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, 'delivered', 'paid', ?, 'pickup', ?, 0, ?, ?, ?, ?, ?)
      `).run(
        companyId,
        orderNumber,
        String(clientName || 'Розничный покупатель').trim() || 'Розничный покупатель',
        String(clientPhone || '').trim(),
        String(clientEmail || '').trim(),
        String(clientAddress || '').trim(),
        payMethod,
        subtotal,
        total,
        String(notes || '').trim(),
        JSON.stringify(orderItems),
        now,
        now
      );
      const orderId = orderResult.lastInsertRowid;

      for (const line of lines) {
        db.prepare(
          'UPDATE inventory_items SET quantity = quantity - ?, updatedAt = ? WHERE id = ? AND companyId = ?'
        ).run(line.quantity, now, line.itemId, companyId);
      }

      const categoryId = ensureShopSalesCategoryId(companyId);
      const clientLabel = String(clientName || '').trim();
      const description = `Продажа из магазина: ${orderNumber}${clientLabel ? ` (${clientLabel})` : ''}`;

      const paymentResult = db.prepare(`
        INSERT INTO payments (companyId, amount, type, categoryId, description, date, saleCategory, method, createdAt, updatedAt)
        VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, total, categoryId, description, now, resolvedSaleCategory, payMethod, now, now);
      const paymentId = paymentResult.lastInsertRowid;

      if (costTotal > 0) {
        db.prepare(`
          INSERT INTO payments (companyId, amount, type, description, date, method, createdAt, updatedAt)
          VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
        `).run(companyId, costTotal, `Себестоимость: ${description}`, now, payMethod, now, now);
      }

      const saleIds = [];
      const insertSale = db.prepare(`
        INSERT INTO inventory_sales
          (companyId, itemId, quantity, pricePerUnit, total, paymentId, customer, comment, method, shopOrderId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const line of lines) {
        const r = insertSale.run(
          companyId,
          line.itemId,
          line.quantity,
          line.price,
          line.lineTotal,
          paymentId,
          clientLabel,
          String(notes || '').trim() || description,
          payMethod,
          orderId,
          now
        );
        saleIds.push(r.lastInsertRowid);
      }

      if (clientPhone && String(clientPhone).trim()) {
        try {
          const { upsertClientByPhone, recalcClientStatsByPhone } = require('./clients');
          upsertClientByPhone(companyId, String(clientPhone).trim(), {
            name: String(clientName || '').trim(),
            email: String(clientEmail || '').trim(),
          });
          recalcClientStatsByPhone(companyId, String(clientPhone).trim());
        } catch (e) {
          console.error('POS sale client upsert:', e);
        }
      }

      return { orderId, paymentId, saleIds, orderNumber };
    })();

    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(result.orderId);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);

    res.status(201).json({
      success: true,
      paymentId: result.paymentId,
      saleIds: result.saleIds,
      costTotal,
      order: mapShopOrder(order, companyId),
      invoice: {
        order: mapShopOrder(order, companyId),
        company: {
          name: company?.name || '',
          address: company?.address || '',
          phone: company?.phone || '',
          email: company?.email || '',
          inn: company?.inn || '',
          kpp: company?.kpp || '',
        },
        invoiceDate: now,
        costTotal,
      },
    });
  } catch (error) {
    console.error('Ошибка POS-продажи:', error);
    res.status(500).json({ error: error?.message || 'Ошибка продажи' });
  }
});

// История реализаций (оплаченные заказы магазина)
router.get('/sales', (req, res) => {
  try {
    const orders = db
      .prepare(`
        SELECT * FROM shop_orders
        WHERE companyId = ? AND paymentStatus = 'paid'
        ORDER BY createdAt DESC, id DESC
        LIMIT 200
      `)
      .all(req.user.companyId);
    res.json(orders.map((o) => mapShopOrder(o, req.user.companyId)));
  } catch (error) {
    console.error('Ошибка истории продаж магазина:', error);
    res.status(500).json({ error: 'Ошибка получения продаж' });
  }
});

module.exports = router;

