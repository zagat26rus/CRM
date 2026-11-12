const {
  ORDER_STATUSES,
  CLOSED_SUCCESS_STATUSES,
  CANCELLED_STATUSES,
  CLOSED_FAILED_STATUSES,
  ALLOWED_STATUSES,
  normalizeCrmStatus
} = require('../constants/orderStatuses');
const { getCompanySettings } = require('../utils/companySettings');
const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { requireManagement } = require('../middlewares/rbac');
const { normalizePhone } = require('../utils/phone');
const axios = require('axios');
const crypto = require('crypto');
const { allocateDocumentNumber } = require('./documents');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  ensurePublicTokenColumn,
  newPublicToken,
  ensureOrderPublicToken
} = require('./publicTrack');
const { maybeSendOrderSms, isReadyStatus } = require('../utils/smsService');

ensurePublicTokenColumn();

function fireOrderSms(companyId, order, event, createdByUserId = null) {
  setImmediate(() => {
    maybeSendOrderSms(db, companyId, order, event)
      .then((result) => {
        if (!result || result.skipped) return;
        try {
          addOrderHistoryEvent(companyId, Number(order.id), {
            type: 'sms',
            message: result.ok
              ? `SMS (${event}) отправлено на ${order.phone}`
              : `SMS (${event}) не отправлено: ${result.error || 'ошибка'}`,
            meta: {
              event,
              ok: Boolean(result.ok),
              provider: result.provider || null,
              error: result.error || null,
              textPreview: String(result.text || '').slice(0, 160),
            },
            createdByUserId,
          });
        } catch (e) {
          console.error('sms history', e.message || e);
        }
      })
      .catch((e) => console.error('sms fire', e.message || e));
  });
}

function safeParseJson(text, fallback) {
  try {
    const v = JSON.parse(String(text || ''));
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function orderUploadDir(orderId) {
  return path.join(__dirname, '..', '..', 'uploads', 'orders', String(orderId));
}

function privateSignaturePath(orderId) {
  return path.join(__dirname, '..', '..', 'data', 'signatures', `order-${Number(orderId)}.png`);
}

function toPublicUploadPath(absPath) {
  const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
  const rel = path.relative(uploadsRoot, absPath).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

const ACCEPTANCE_TERMS_VERSION = 'repair-intake-2026-11';

function decodeClientSignature(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    const error = new Error('Подпись должна быть изображением PNG');
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (buffer.length < 100 || buffer.length > 500 * 1024) {
    const error = new Error('Некорректный размер подписи');
    error.statusCode = 400;
    throw error;
  }
  // PNG magic bytes
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    const error = new Error('Некорректный файл подписи');
    error.statusCode = 400;
    throw error;
  }
  return buffer;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const orderId = req.params.id;
      const dir = orderUploadDir(orderId);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = String(file.originalname || 'file').replace(/[^\w.\- ()]+/g, '_');
      const stamp = Date.now();
      cb(null, `${stamp}__${safe}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

function addOrderHistoryEvent(companyId, orderId, { type, message, attachments = [], meta = {}, createdByUserId = null }) {
  const now = getCurrentTime();
  db.prepare(
    `
    INSERT INTO order_history (companyId, orderId, type, message, attachments, meta, createdByUserId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    companyId,
    orderId,
    type,
    String(message || '').trim().substring(0, 2000) || '(пусто)',
    JSON.stringify(Array.isArray(attachments) ? attachments : []),
    JSON.stringify(meta || {}),
    createdByUserId,
    now
  );
}

// Middleware для проверки API ключа интеграции (публичный доступ)
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API ключ обязателен. Укажите заголовок X-API-Key' });
  }
  
  // Находим интеграцию по API ключу
  const integration = db.prepare('SELECT * FROM integrations WHERE apiKey = ? AND isActive = 1').get(apiKey);
  
  if (!integration) {
    return res.status(401).json({ error: 'Неверный или неактивный API ключ' });
  }
  
  // Сохраняем информацию об интеграции в запросе
  req.integration = integration;
  req.user = { companyId: integration.companyId }; // Эмулируем пользователя для совместимости
  
  next();
}

// Простой rate limiting для внешних API
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const key = `ratelimit:${ip}`;
  const record = rateLimitMap.get(key);
  
  if (!record || now - record.firstRequest > windowMs) {
    rateLimitMap.set(key, { firstRequest: now, count: 1 });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

// Очистка старых записей каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.firstRequest > 60000) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

// Публичный endpoint для создания заказов через API ключ интеграции
router.post('/external', requireApiKey, (req, res) => {
  try {
    // Rate limiting: максимум 20 запросов в минуту с одного IP
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (!checkRateLimit(ip, 20, 60000)) {
      return res.status(429).json({ error: 'Слишком много запросов. Пожалуйста, подождите минуту.' });
    }
    
    const { 
      client, 
      phone, 
      email = '',
      problem = '', // legacy - для обратной совместимости
      problems = [], // новый формат - массив поломок
      brand, 
      model, 
      deviceType = 'Смартфон',
      status = 'Создана', // По умолчанию "Новый" для внешних заказов
      price = 0,
      costPrice = 0,
      description = '',
      warranty = false,
      onSite = false,
      paymentMethod = 'cash'
    } = req.body;
    
    // Валидация и санитизация входных данных
    if (!client || !phone) {
      return res.status(400).json({ error: 'Заполните обязательные поля: client, phone' });
    }
    
    // Ограничиваем длину полей для защиты от переполнения
    const sanitizedClient = String(client || '').trim().substring(0, 100);
    const sanitizedPhone = String(phone || '').trim().substring(0, 32);
    const sanitizedEmail = String(email || '').trim().substring(0, 255);
    const sanitizedBrand = String(brand || '').trim().substring(0, 100);
    const sanitizedModel = String(model || '').trim().substring(0, 100);
    const sanitizedDescription = String(description || '').trim().substring(0, 2000);
    
    if (!sanitizedClient || !sanitizedPhone) {
      return res.status(400).json({ error: 'Заполните обязательные поля: client, phone' });
    }
    
    // Валидация телефона: должен содержать только цифры
    const phoneDigits = sanitizedPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      return res.status(400).json({ error: 'Некорректный номер телефона' });
    }
    
    // Если problems не передан, используем legacy problem
    const problemsList = Array.isArray(problems) && problems.length > 0 
      ? problems 
      : (problem ? [{ problemName: problem, price: Number(price) || 0, costPrice: Number(costPrice) || 0 }] : []);
    
    if (problemsList.length === 0 && !problem) {
      return res.status(400).json({ error: 'Добавьте хотя бы одну поломку (problem или problems)' });
    }
    
    const now = getCurrentTime();
    const companyId = req.integration.companyId;
    
    // Вычисляем общую сумму из всех поломок
    const totalPrice = problemsList.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
    const totalCostPrice = problemsList.reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0);
    
    // Для обратной совместимости: problem = первая поломка или пустая строка
    const firstProblem = problemsList[0]?.problemName || problem || '';
    
    const tx = db.transaction(() => {
      // Создаем заказ
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          companyId, client, phone, problem, brand, model, deviceType, 
          status, price, costPrice, description, warranty, onSite, 
          paymentMethod, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const orderResult = insertOrder.run(
        companyId,
        sanitizedClient,
        phoneDigits, // Используем нормализованный телефон
        firstProblem,
        sanitizedBrand,
        sanitizedModel,
        String(deviceType || 'Смартфон').substring(0, 50),
        String(status || 'Создана').substring(0, 50),
        totalPrice,
        totalCostPrice,
        sanitizedDescription,
        warranty ? 1 : 0,
        onSite ? 1 : 0,
        String(paymentMethod || 'cash').substring(0, 20),
        now,
        now
      );
      
      const orderId = orderResult.lastInsertRowid;
      
      // Добавляем поломки, если они есть
      if (problemsList.length > 0) {
        const insertProblem = db.prepare(`
          INSERT INTO order_problems (
            orderId, problemId, problemName, problemDescription, price, costPrice, sortOrder, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        problemsList.forEach((p, idx) => {
          // Валидация и санитизация данных поломки
          const sanitizedProblemName = String(p.problemName || '').trim().substring(0, 255);
          const sanitizedProblemDesc = String(p.problemDescription || '').trim().substring(0, 1000);
          const problemId = p.problemId ? (Number(p.problemId) > 0 ? Number(p.problemId) : null) : null;
          const price = Math.max(0, Math.min(Number(p.price) || 0, 999999999)); // Ограничиваем максимальную цену
          const costPrice = Math.max(0, Math.min(Number(p.costPrice) || 0, 999999999));
          
          if (!sanitizedProblemName) {
            console.warn(`Пропущена поломка без названия в заказе ${orderId}`);
            return; // Пропускаем поломки без названия
          }
          
          insertProblem.run(
            orderId,
            problemId,
            sanitizedProblemName,
            sanitizedProblemDesc,
            price,
            costPrice,
            idx,
            now
          );
        });
      }
      
      return orderId;
    });
    
    const orderId = tx();
    try { ensureOrderPublicToken(orderId) } catch (e) { console.error('publicToken external:', e) }
    
    const newOrder = db
      .prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?')
      .get(orderId, companyId);
    
    // Получаем поломки заказа
    const orderProblems = db
      .prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(orderId);

    // upsert + пересчёт клиента (обращения/выручка)
    try {
      linkClientToOrder(companyId, orderId, phoneDigits, { name: sanitizedClient, email: sanitizedEmail });
      recalcClientStatsByPhone(companyId, normalizePhone(phoneDigits));
    } catch (e) {
      console.error('Ошибка upsert/recalc клиента:', e);
    }
    
    // Форматируем для ответа
    const formattedOrder = {
      ...newOrder,
      id: newOrder.id,
      warranty: Boolean(newOrder.warranty),
      onSite: Boolean(newOrder.onSite),
      problems: orderProblems.map(p => ({
        id: p.id,
        problemId: p.problemId,
        problemName: p.problemName,
        problemDescription: p.problemDescription,
        price: Number(p.price) || 0,
        costPrice: Number(p.costPrice) || 0
      }))
    };
    
    res.status(201).json(formattedOrder);
  } catch (error) {
    console.error('Ошибка создания заказа через API:', error);
    res.status(500).json({ error: 'Ошибка создания заказа' });
  }
});

// Все остальные роуты требуют авторизации пользователя
router.use(requireAuth);

// Функция для отправки webhook при изменении статуса заказа
async function sendWebhookOnStatusChange(companyId, orderId, oldStatus, newStatus) {
  try {
    // Получаем все активные интеграции для этой компании
    const integrations = db.prepare(`
      SELECT * FROM integrations 
      WHERE companyId = ? AND isActive = 1 AND webhookUrl != '' AND webhookUrl IS NOT NULL
    `).all(companyId);
    
    if (integrations.length === 0) {
      return; // Нет настроенных webhook'ов
    }
    
    // Получаем данные заказа
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(orderId, companyId);
    if (!order) {
      return;
    }
    
    // Отправляем webhook для каждой интеграции
    for (const integration of integrations) {
      try {
        const webhookData = {
          orderId: orderId,
          status: newStatus,
          oldStatus: oldStatus,
          timestamp: new Date().toISOString(),
          order: {
            id: order.id,
            client: order.client,
            phone: order.phone,
            brand: order.brand,
            model: order.model,
            problem: order.problem,
            status: newStatus
          }
        };
        
        const headers = {
          'Content-Type': 'application/json',
        };
        
        // Добавляем секретный ключ, если он настроен
        if (integration.webhookSecret) {
          headers['X-Webhook-Secret'] = integration.webhookSecret;
        }
        
        // Отправляем webhook асинхронно (не блокируем ответ)
        axios.post(integration.webhookUrl, webhookData, { 
          headers,
          timeout: 5000 
        }).catch(err => {
          console.error(`Ошибка отправки webhook для интеграции ${integration.id}:`, err.message);
        });
      } catch (err) {
        console.error(`Ошибка при подготовке webhook для интеграции ${integration.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Ошибка при отправке webhook:', err.message);
  }
}

function upsertClientByPhone(companyId, phone, { name, email } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  const now = getCurrentTime();
  const existing = db.prepare('SELECT * FROM clients WHERE companyId = ? AND phone = ?').get(companyId, normalized);
  if (existing) {
    const nextName = String(name || '').trim();
    const nextEmail = String(email || '').trim();
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

function linkClientToOrder(companyId, orderId, phone, { name, email } = {}) {
  const clientId = upsertClientByPhone(companyId, phone, { name, email });
  if (clientId && orderId) {
    const normalized = normalizePhone(phone);
    db.prepare('UPDATE orders SET clientId = ?, phone = ? WHERE id = ? AND companyId = ?').run(
      clientId,
      normalized,
      orderId,
      companyId
    );
  }
  return clientId;
}

function syncOrderProblems(orderId, rawProblems, opts = {}) {
  const now = getCurrentTime();
  const problemsList = Array.isArray(rawProblems) ? rawProblems : [];
  const preservePrice = Boolean(opts.preservePrice);
  const preserveCost = Boolean(opts.preserveCost);

  db.prepare('DELETE FROM order_problems WHERE orderId = ?').run(orderId);

  const insertProblem = db.prepare(`
    INSERT INTO order_problems (
      orderId, problemId, problemName, problemDescription, price, costPrice, sortOrder, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let idx = 0;
  for (const p of problemsList) {
    const sanitizedProblemName = String(p.problemName || p.problem || '').trim().substring(0, 255);
    if (!sanitizedProblemName) continue;
    const sanitizedProblemDesc = String(p.problemDescription || p.description || '').trim().substring(0, 1000);
    const problemId = p.problemId ? (Number(p.problemId) > 0 ? Number(p.problemId) : null) : null;
    const price = Math.max(0, Math.min(Number(p.price) || 0, 999999999));
    const costPrice = Math.max(0, Math.min(Number(p.costPrice) || 0, 999999999));
    insertProblem.run(orderId, problemId, sanitizedProblemName, sanitizedProblemDesc, price, costPrice, idx, now);
    idx++;
  }

  const rows = db.prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC').all(orderId);
  const totalPrice = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const totalCostPrice = rows.reduce((s, r) => s + (Number(r.costPrice) || 0), 0);
  const firstProblem = rows[0]?.problemName || '';

  if (preservePrice && preserveCost) {
    db.prepare('UPDATE orders SET problem = ?, updatedAt = ? WHERE id = ?').run(firstProblem, now, orderId);
  } else if (preservePrice) {
    db.prepare('UPDATE orders SET costPrice = ?, problem = ?, updatedAt = ? WHERE id = ?').run(
      totalCostPrice,
      firstProblem,
      now,
      orderId
    );
  } else if (preserveCost) {
    db.prepare('UPDATE orders SET price = ?, problem = ?, updatedAt = ? WHERE id = ?').run(
      totalPrice,
      firstProblem,
      now,
      orderId
    );
  } else {
    db.prepare('UPDATE orders SET price = ?, costPrice = ?, problem = ?, updatedAt = ? WHERE id = ?').run(
      totalPrice,
      totalCostPrice,
      firstProblem,
      now,
      orderId
    );
  }
  if (!preserveCost) recalcOrderCostFromPartsAndProblems(orderId);
}

function mapOrderPartRow(p) {
  return {
    id: p.id,
    itemId: p.itemId,
    itemName: p.itemName,
    sku: p.sku || '',
    quantity: Number(p.quantity) || 0,
    purchasePrice: Number(p.purchasePrice) || 0,
    salePrice: Number(p.salePrice) || 0,
  };
}

function syncOrderParts(companyId, orderId, rawParts) {
  const order = db.prepare('SELECT partsWrittenOff FROM orders WHERE id = ? AND companyId = ?').get(orderId, companyId);
  if (!order) throw new Error('Заказ не найден');
  if (order.partsWrittenOff) {
    throw new Error('Запчасти уже списаны со склада — изменить состав нельзя');
  }

  const now = getCurrentTime();
  const partsList = Array.isArray(rawParts) ? rawParts : [];
  db.prepare('DELETE FROM order_parts WHERE orderId = ?').run(orderId);

  const insertPart = db.prepare(`
    INSERT INTO order_parts (
      companyId, orderId, itemId, itemName, sku, quantity, purchasePrice, salePrice, sortOrder, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let idx = 0;
  for (const p of partsList) {
    const itemId = Number(p.itemId);
    const qty = Math.max(1, Math.min(Number(p.quantity) || 1, 9999));
    if (!itemId) continue;

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND companyId = ?').get(itemId, companyId);
    if (!item) continue;

    const purchasePrice = Math.max(0, Number(p.purchasePrice ?? item.purchasePrice) || 0);
    const salePrice = Math.max(0, Number(p.salePrice ?? item.salePrice) || 0);
    const itemName = String(p.itemName || item.name || '').trim().substring(0, 255);
    const sku = String(p.sku || item.sku || '').trim().substring(0, 100);
    if (!itemName) continue;

    insertPart.run(companyId, orderId, itemId, itemName, sku, qty, purchasePrice, salePrice, idx, now);
    idx++;
  }

  recalcOrderCostFromPartsAndProblems(orderId);
}

function recalcOrderCostFromPartsAndProblems(orderId) {
  const problems = db.prepare('SELECT costPrice FROM order_problems WHERE orderId = ?').all(orderId);
  const parts = db.prepare('SELECT purchasePrice, quantity FROM order_parts WHERE orderId = ?').all(orderId);
  const problemsCost = problems.reduce((s, p) => s + (Number(p.costPrice) || 0), 0);
  const partsCost = parts.reduce((s, p) => s + (Number(p.purchasePrice) || 0) * (Number(p.quantity) || 0), 0);
  const now = getCurrentTime();
  db.prepare('UPDATE orders SET costPrice = ?, updatedAt = ? WHERE id = ?').run(problemsCost + partsCost, now, orderId);
}

function writeOffOrderParts(companyId, orderId) {
  const order = db.prepare('SELECT partsWrittenOff FROM orders WHERE id = ? AND companyId = ?').get(orderId, companyId);
  if (!order || order.partsWrittenOff) return { skipped: true };

  const parts = db.prepare('SELECT * FROM order_parts WHERE orderId = ? ORDER BY sortOrder ASC').all(orderId);
  if (parts.length === 0) return { writtenOff: 0 };

  const now = getCurrentTime();
  const tx = db.transaction(() => {
    for (const p of parts) {
      const item = db.prepare('SELECT quantity, name FROM inventory_items WHERE id = ? AND companyId = ?').get(p.itemId, companyId);
      if (!item) throw new Error(`Товар не найден: ${p.itemName}`);
      if (Number(item.quantity) < Number(p.quantity)) {
        throw new Error(`Недостаточно на складе: ${p.itemName} (нужно ${p.quantity}, есть ${item.quantity})`);
      }
      db.prepare('UPDATE inventory_items SET quantity = quantity - ?, updatedAt = ? WHERE id = ? AND companyId = ?').run(
        p.quantity,
        now,
        p.itemId,
        companyId
      );
    }
    db.prepare('UPDATE orders SET partsWrittenOff = 1, updatedAt = ? WHERE id = ? AND companyId = ?').run(now, orderId, companyId);
  });
  tx();
  return { writtenOff: parts.length };
}

function applyWarrantyOnClose(companyId, orderId, existingOrder, updates) {
  const newStatus = updates.status !== undefined ? updates.status : existingOrder.status;
  if (!CLOSED_SUCCESS_STATUSES.includes(newStatus)) return;

  const warranty = updates.warranty !== undefined ? !!updates.warranty : !!existingOrder.warranty;
  if (!warranty) {
    db.prepare('UPDATE orders SET warrantyEndsAt = NULL WHERE id = ?').run(orderId);
    return;
  }

  const settings = getCompanySettings(db, companyId);
  const days = Number(updates.warrantyDays) > 0
    ? Number(updates.warrantyDays)
    : Number(existingOrder.warrantyDays) > 0
      ? Number(existingOrder.warrantyDays)
      : settings.warrantyDaysDefault;

  const ends = new Date();
  ends.setDate(ends.getDate() + days);
  db.prepare('UPDATE orders SET warrantyDays = ?, warrantyEndsAt = ? WHERE id = ?').run(days, ends.toISOString(), orderId);
}

function handleOrderClosedSideEffects(companyId, orderId, oldStatus, newStatus) {
  if (oldStatus === newStatus) return;
  if (!CLOSED_SUCCESS_STATUSES.includes(newStatus)) return;
  writeOffOrderParts(companyId, orderId);
}

function formatOrderResponse(order, problems = [], parts = []) {
  return {
    ...order,
    warranty: Boolean(order.warranty),
    onSite: Boolean(order.onSite),
    isUrgent: Boolean(order.isUrgent),
    partsWrittenOff: Boolean(order.partsWrittenOff),
    warrantyDays: Number(order.warrantyDays) || 0,
    warrantyEndsAt: order.warrantyEndsAt || null,
    inspection: safeParseJson(order.inspection, {}),
    wishes: safeParseJson(order.wishes, {}),
    problems: problems.map((p) => ({
      id: p.id,
      problemId: p.problemId,
      problemName: p.problemName,
      problemDescription: p.problemDescription,
      price: Number(p.price) || 0,
      costPrice: Number(p.costPrice) || 0,
    })),
    parts: parts.map(mapOrderPartRow),
  };
}

function loadPartsByOrderIds(orderIds) {
  if (!orderIds.length) return {};
  const rows = db
    .prepare(`SELECT * FROM order_parts WHERE orderId IN (${orderIds.map(() => '?').join(',')}) ORDER BY sortOrder ASC`)
    .all(...orderIds);
  const byOrder = {};
  for (const p of rows) {
    if (!byOrder[p.orderId]) byOrder[p.orderId] = [];
    byOrder[p.orderId].push(p);
  }
  return byOrder;
}

function deletePaymentsForOrder(companyId, orderId) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const result = db.prepare(`
    DELETE FROM payments
    WHERE companyId = ?
      AND (
        orderId = ?
        OR description = ?
        OR description LIKE ?
      )
  `).run(
    companyId,
    id,
    `Оплата заказа #${id}`,
    `%заказа #${id}%`,
  );
  return result.changes || 0;
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

// Статистика по заказам (ВАЖНО: до /:id)
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalOrders: 0,
      newOrders: 0,
      diagnostics: 0,
      waitingParts: 0,
      inProgress: 0,
      ready: 0,
      closed: 0,
      closedFailed: 0,
      refusedService: 0,
      refusedClient: 0,
      cancelled: 0,
      revenue: 0,
      cost: 0,
      profit: 0
    };
    
    const totalResult = db.prepare('SELECT COUNT(*) as total FROM orders WHERE companyId = ?').get(req.user.companyId);
    stats.totalOrders = totalResult.total || 0;
    
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count, 
             SUM(price) as revenue, 
             SUM(costPrice) as cost
      FROM orders 
      WHERE companyId = ?
      GROUP BY status
    `).all(req.user.companyId);
    
    statusCounts.forEach(row => {
      if ((row.status === 'Создана' || row.status === 'Новый')) stats.newOrders = row.count;
      if (row.status === 'Диагностика') stats.diagnostics = row.count;
      if ((row.status === 'Ждёт запчасть' || row.status === 'Ждет запчасти')) stats.waitingParts = row.count;
      if (row.status === 'В работе') stats.inProgress = row.count;
      if ((row.status === 'Готово' || row.status === 'Готов')) stats.ready = row.count;
      if (CLOSED_SUCCESS_STATUSES.includes(row.status)) stats.closed = (stats.closed || 0) + row.count;
      if (CLOSED_FAILED_STATUSES.includes(row.status)) stats.closedFailed = row.count;
      if (row.status === 'Отказ сервиса') stats.refusedService = row.count;
      if (row.status === 'Отказ клиента') stats.refusedClient = row.count;
      if (CANCELLED_STATUSES.includes(row.status)) stats.cancelled = (stats.cancelled || 0) + row.count;
      
      stats.revenue += (row.revenue || 0);
      stats.cost += (row.cost || 0);
    });
    
    stats.profit = stats.revenue - stats.cost;
    
    res.json(stats);
  } catch (error) {
    console.error('Ошибка получения статистики заказов:', error);
    res.status(500).json({ error: 'Ошибка получения статистики заказов' });
  }
});

// Получение всех заказов
router.get('/', (req, res) => {
  try {
    const { 
      status,
      client,
      lifecycle,
      page = 1,
      limit = 100
    } = req.query;
    
    let conditions = ['companyId = ?'];
    let params = [req.user.companyId];

    const closedStatuses = Array.from(
      new Set([...CLOSED_SUCCESS_STATUSES, ...CANCELLED_STATUSES, ...CLOSED_FAILED_STATUSES])
    );
    
    if (status) {
      // Валидация статуса: разрешаем только безопасные значения
      const allowedStatuses = ALLOWED_STATUSES;
      const sanitizedStatus = String(status).trim();
      if (allowedStatuses.includes(sanitizedStatus)) {
        conditions.push('status = ?');
        params.push(sanitizedStatus);
      }
    } else if (String(lifecycle || '').toLowerCase() === 'active') {
      conditions.push(`COALESCE(status,'') NOT IN (${closedStatuses.map(() => '?').join(',')})`);
      params.push(...closedStatuses);
    } else if (String(lifecycle || '').toLowerCase() === 'closed') {
      conditions.push(`COALESCE(status,'') IN (${closedStatuses.map(() => '?').join(',')})`);
      params.push(...closedStatuses);
    }
    
    if (client) {
      // Санитизация поискового запроса: убираем специальные символы SQL
      const sanitizedClient = String(client).trim().replace(/[%_]/g, '').substring(0, 100);
      if (sanitizedClient) {
        conditions.push('(client LIKE ? OR phone LIKE ?)');
        params.push(`%${sanitizedClient}%`);
        params.push(`%${sanitizedClient}%`);
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Получить общее количество
    const countSql = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;
    
    // Получить данные
    const offset = (page - 1) * limit;
    const orders = db.prepare(`
      SELECT * FROM orders 
      ${whereClause}
      ORDER BY createdAt DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    // Получаем поломки для всех заказов
    const orderIds = orders.map(o => o.id);
    const allProblems = orderIds.length > 0 
      ? db.prepare(`SELECT * FROM order_problems WHERE orderId IN (${orderIds.map(() => '?').join(',')}) ORDER BY sortOrder ASC`).all(...orderIds)
      : [];
    
    const problemsByOrderId = {};
    allProblems.forEach(p => {
      if (!problemsByOrderId[p.orderId]) problemsByOrderId[p.orderId] = [];
      problemsByOrderId[p.orderId].push(p);
    });

    const partsByOrderId = loadPartsByOrderIds(orderIds);
    
    const formattedOrders = orders.map(order => formatOrderResponse(
      order,
      problemsByOrderId[order.id] || [],
      partsByOrderId[order.id] || []
    ));
    
    res.json({
      orders: formattedOrders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Получение одного заказа
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    // Получаем поломки заказа
    const orderProblems = db
      .prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(id);
    const orderParts = db
      .prepare('SELECT * FROM order_parts WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(id);
    
    res.json(formatOrderResponse(order, orderProblems, orderParts));
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// История заказа
router.get('/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const items = db
      .prepare(
        `
        SELECT h.*, u.name as userName
        FROM order_history h
        LEFT JOIN users u ON u.id = h.createdByUserId
        WHERE h.orderId = ? AND h.companyId = ?
        ORDER BY h.id DESC
      `
      )
      .all(id, req.user.companyId)
      .map((r) => ({
        ...r,
        attachments: safeParseJson(r.attachments, []),
        meta: safeParseJson(r.meta, {}),
        createdBy: r.createdByUserId ? { id: r.createdByUserId, name: r.userName || '' } : null
      }));

    res.json({ items });
  } catch (e) {
    console.error('Ошибка истории заказа:', e);
    res.status(500).json({ error: 'Ошибка истории заказа' });
  }
});

router.post('/:id/history/comment', (req, res) => {
  try {
    const { id } = req.params;
    const { message = '' } = req.body || {};
    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'Комментарий пустой' });

    addOrderHistoryEvent(req.user.companyId, Number(id), {
      type: 'comment',
      message: text,
      createdByUserId: req.user.id
    });

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Ошибка добавления комментария:', e);
    res.status(500).json({ error: 'Ошибка добавления комментария' });
  }
});

router.post('/:id/history/files', upload.array('files', 10), (req, res) => {
  try {
    const { id } = req.params;
    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) return res.status(400).json({ error: 'Файлы не переданы' });

    const attachments = files.map((f) => ({
      name: f.originalname,
      size: f.size,
      mime: f.mimetype,
      url: toPublicUploadPath(f.path)
    }));

    addOrderHistoryEvent(req.user.companyId, Number(id), {
      type: 'file',
      message: `Загружено файлов: ${attachments.length}`,
      attachments,
      createdByUserId: req.user.id
    });

    res.status(201).json({ ok: true, attachments });
  } catch (e) {
    console.error('Ошибка загрузки файлов:', e);
    res.status(500).json({ error: 'Ошибка загрузки файлов' });
  }
});

// Создание заказа
router.post('/', (req, res) => {
  try {
    const { 
      client, 
      phone, 
      email = '',
      clientAddress = '',
      problem, // legacy - для обратной совместимости
      problems = [], // новый формат - массив поломок
      brand, 
      model, 
      deviceType = 'Смартфон',
      color = '',
      imei = '',
      serialNumber = '',
      equipment = '',
      devicePassword = '',
      status = 'В работе',
      price = 0,
      costPrice = 0,
      estimatedPrice = 0,
      prepayment = 0,
      description = '',
      receiverNotes = '',
      inspection = {},
      wishes = {},
      managerName = '',
      executorName = '',
      dueAt = null,
      isUrgent = false,
      warranty = false,
      onSite = false,
      paymentMethod = 'cash',
      documentNumber = '',
      clientSignatureData = ''
    } = req.body;
    
    if (!client || !phone) {
      return res.status(400).json({ error: 'Заполните обязательные поля: клиент, телефон' });
    }
    
    // Если problems не передан, используем legacy problem
    const problemsList = Array.isArray(problems) && problems.length > 0 
      ? problems 
      : (problem ? [{ problemName: problem, price: Number(price) || 0, costPrice: Number(costPrice) || 0 }] : []);
    
    if (problemsList.length === 0) {
      problemsList.push({ problemName: 'Приём в ремонт', price: Number(price) || 0, costPrice: Number(costPrice) || 0 });
    }
    
    const signatureBuffer = decodeClientSignature(clientSignatureData);
    const now = getCurrentTime();
    const clientSignedAt = signatureBuffer ? now : null;
    const docNum = allocateDocumentNumber(req.user.companyId, 'repair_receipt', documentNumber);
    
    // Вычисляем общую сумму из всех поломок
    const totalPrice = problemsList.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
    const totalCostPrice = problemsList.reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0);
    
    // Для обратной совместимости: problem = первая поломка или пустая строка
    const firstProblem = problemsList[0]?.problemName || problem || '';
    
    const tx = db.transaction(() => {
      // Создаем заказ
      const publicToken = newPublicToken();
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          companyId, client, phone, email, clientAddress, problem, brand, model, color, deviceType,
          imei, serialNumber, equipment, devicePassword,
          status, price, costPrice, estimatedPrice, prepayment,
          description, receiverNotes, inspection, wishes, managerName, executorName, dueAt, isUrgent, warranty, onSite,
          paymentMethod, documentNumber, publicToken, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const orderResult = insertOrder.run(
        req.user.companyId,
        client,
        phone,
        String(email || ''),
        String(clientAddress || ''),
        firstProblem,
        brand || '',
        model || '',
        String(color || ''),
        deviceType,
        String(imei || ''),
        String(serialNumber || ''),
        String(equipment || ''),
        String(devicePassword || ''),
        status,
        totalPrice,
        totalCostPrice,
        Number(estimatedPrice) || 0,
        Number(prepayment) || 0,
        description || '',
        String(receiverNotes || ''),
        JSON.stringify(inspection || {}),
        JSON.stringify(wishes || {}),
        String(managerName || ''),
        String(executorName || ''),
        dueAt ? String(dueAt) : null,
        isUrgent ? 1 : 0,
        warranty ? 1 : 0,
        onSite ? 1 : 0,
        paymentMethod,
        docNum,
        publicToken,
        now,
        now
      );
      
      const orderId = orderResult.lastInsertRowid;

      if (signatureBuffer) {
        const signaturePath = privateSignaturePath(orderId);
        ensureDir(path.dirname(signaturePath));
        fs.writeFileSync(signaturePath, signatureBuffer);
        const clientSignatureUrl = `/api/public/track/${publicToken}/signature`;
        const acceptanceSnapshot = {
          id: Number(orderId),
          documentNumber: docNum,
          publicToken,
          client: String(client || ''),
          phone: String(phone || ''),
          email: String(email || ''),
          clientAddress: String(clientAddress || ''),
          brand: String(brand || ''),
          model: String(model || ''),
          color: String(color || ''),
          deviceType: String(deviceType || ''),
          imei: String(imei || ''),
          serialNumber: String(serialNumber || ''),
          equipment: String(equipment || ''),
          problem: firstProblem,
          description: String(description || ''),
          receiverNotes: String(receiverNotes || ''),
          dueAt: dueAt ? String(dueAt) : null,
          estimatedPrice: Number(estimatedPrice) || 0,
          prepayment: Number(prepayment) || 0,
          inspection: inspection || {},
          wishes: wishes || {},
          problems: problemsList.map((p) => ({
            problemName: String(p.problemName || ''),
            problemDescription: String(p.problemDescription || ''),
          })),
          clientSignatureUrl,
          clientSignedAt,
          acceptanceTermsVersion: ACCEPTANCE_TERMS_VERSION,
          createdAt: now,
        };
        db.prepare(`
          UPDATE orders
          SET clientSignatureUrl = ?, clientSignedAt = ?, acceptanceTermsVersion = ?,
              acceptanceSnapshot = ?
          WHERE id = ? AND companyId = ?
        `).run(
          clientSignatureUrl,
          clientSignedAt,
          ACCEPTANCE_TERMS_VERSION,
          JSON.stringify(acceptanceSnapshot),
          orderId,
          req.user.companyId
        );
      }
      
      // Добавляем поломки
      const insertProblem = db.prepare(`
        INSERT INTO order_problems (
          orderId, problemId, problemName, problemDescription, price, costPrice, sortOrder, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      problemsList.forEach((p, idx) => {
        insertProblem.run(
          orderId,
          p.problemId ? Number(p.problemId) : null,
          String(p.problemName || ''),
          String(p.problemDescription || ''),
          Number(p.price) || 0,
          Number(p.costPrice) || 0,
          idx,
          now
        );
      });
      
      return orderId;
    });
    
    const orderId = tx();
    
    const newOrder = db
      .prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?')
      .get(orderId, req.user.companyId);
    
    // Получаем поломки заказа
    const orderProblems = db
      .prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(orderId);

    // upsert + пересчёт клиента (обращения/выручка)
    try {
      linkClientToOrder(req.user.companyId, orderId, phone, { name: client, email });
      recalcClientStatsByPhone(req.user.companyId, normalizePhone(phone));
    } catch (e) {
      console.error('Ошибка upsert/recalc клиента:', e);
    }
    
    // Форматируем для фронтенда
    const formattedOrder = {
      ...newOrder,
      warranty: Boolean(newOrder.warranty),
      onSite: Boolean(newOrder.onSite),
      inspection: safeParseJson(newOrder.inspection, {}),
      wishes: safeParseJson(newOrder.wishes, {}),
      problems: orderProblems.map(p => ({
        id: p.id,
        problemId: p.problemId,
        problemName: p.problemName,
        problemDescription: p.problemDescription,
        price: Number(p.price) || 0,
        costPrice: Number(p.costPrice) || 0
      }))
    };

    try {
      fireOrderSms(req.user.companyId, newOrder, 'intake', req.user.id);
    } catch (e) {
      console.error('intake sms schedule', e);
    }
    
    res.status(201).json({
      ...formattedOrder,
      acceptanceSnapshot: safeParseJson(formattedOrder.acceptanceSnapshot, {}),
    });
  } catch (error) {
    console.error('Ошибка создания заказа:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Ошибка создания заказа' });
  }
});

// Обновление заказа
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Проверяем существование заказа
    const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!existingOrder) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const oldPhone = existingOrder.phone;
    const oldStatus = existingOrder.status;
    const newStatus = updates.status || existingOrder.status;
    
    // Если обновляется только статус
    if (Object.keys(updates).length === 1 && updates.status) {
      const now = getCurrentTime();
      db.prepare('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ? AND companyId = ?')
        .run(updates.status, now, id, req.user.companyId);
      
      if (oldStatus !== newStatus) {
        try {
          applyWarrantyOnClose(req.user.companyId, Number(id), existingOrder, updates);
          handleOrderClosedSideEffects(req.user.companyId, Number(id), oldStatus, newStatus);
        } catch (e) {
          console.error('Ошибка закрытия заказа:', e);
          return res.status(400).json({ error: e.message || 'Ошибка при закрытии заказа' });
        }
        sendWebhookOnStatusChange(req.user.companyId, id, oldStatus, newStatus);
        try {
          addOrderHistoryEvent(req.user.companyId, Number(id), {
            type: 'status',
            message: `Статус изменен: ${oldStatus} → ${newStatus}`,
            meta: { oldStatus, newStatus },
            createdByUserId: req.user.id
          });
        } catch (e) {
          console.error('Ошибка записи истории статуса:', e);
        }
        if (isReadyStatus(newStatus) && !isReadyStatus(oldStatus)) {
          const readyOrder = db
            .prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?')
            .get(id, req.user.companyId);
          if (readyOrder) fireOrderSms(req.user.companyId, readyOrder, 'ready', req.user.id);
        }
      }
    } else {
      // Полное обновление
      const allowedFields = [
        'client',
        'phone',
        'clientAddress',
        'problem',
        'brand',
        'model',
        'color',
        'deviceType',
        'imei',
        'serialNumber',
        'equipment',
        'devicePassword',
        'status',
        'price',
        'costPrice',
        'estimatedPrice',
        'prepayment',
        'description',
        'receiverNotes',
        'inspection',
        'wishes',
        'managerName',
        'executorName',
        'dueAt',
        'isUrgent',
        'warranty',
        'warrantyDays',
        'warrantyEndsAt',
        'onSite',
        'paymentMethod',
        'email',
        'documentNumber'
      ];
      
      const fields = [];
      const params = [];
      const now = getCurrentTime();
      
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          fields.push(`${field} = ?`);
          
          if (field === 'warranty' || field === 'onSite' || field === 'isUrgent') {
            params.push(updates[field] ? 1 : 0);
          } else if (field === 'price' || field === 'costPrice' || field === 'estimatedPrice' || field === 'prepayment' || field === 'warrantyDays') {
            params.push(Number(updates[field]) || 0);
          } else if (field === 'inspection' || field === 'wishes') {
            params.push(JSON.stringify(updates[field] || {}));
          } else if (field === 'phone') {
            params.push(normalizePhone(updates[field]));
          } else {
            params.push(updates[field]);
          }
        }
      });
      
      const hasProblems = Array.isArray(updates.problems);
      const hasParts = Array.isArray(updates.parts);
      if (fields.length === 0 && !hasProblems && !hasParts) {
        return res.status(400).json({ error: 'Нет полей для обновления' });
      }
      
      if (fields.length > 0) {
        fields.push('updatedAt = ?');
        params.push(now);
        params.push(id);
        
        const sql = `UPDATE orders SET ${fields.join(', ')} WHERE id = ?`;
        db.prepare(`${sql} AND companyId = ?`).run(...params, req.user.companyId);
      }

      try {
        if (hasProblems) {
          let problemsPayload = updates.problems;
          if (
            Array.isArray(problemsPayload) &&
            problemsPayload.length === 1 &&
            (updates.price !== undefined || updates.costPrice !== undefined)
          ) {
            problemsPayload = [{
              ...problemsPayload[0],
              price: updates.price !== undefined ? Number(updates.price) || 0 : problemsPayload[0].price,
              costPrice: updates.costPrice !== undefined ? Number(updates.costPrice) || 0 : problemsPayload[0].costPrice,
            }];
          }
          syncOrderProblems(id, problemsPayload, {
            preservePrice: updates.price !== undefined,
            preserveCost: updates.costPrice !== undefined,
          });
        }
        if (hasParts) syncOrderParts(req.user.companyId, id, updates.parts);
        if (updates.price !== undefined || updates.costPrice !== undefined) {
          const nextPrice = updates.price !== undefined ? Number(updates.price) || 0 : Number(existingOrder.price) || 0;
          const nextCost = updates.costPrice !== undefined ? Number(updates.costPrice) || 0 : Number(existingOrder.costPrice) || 0;
          db.prepare('UPDATE orders SET price = ?, costPrice = ?, updatedAt = ? WHERE id = ? AND companyId = ?')
            .run(nextPrice, nextCost, getCurrentTime(), id, req.user.companyId);
        }
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Ошибка обновления позиций заказа' });
      }
      
      // Отправляем webhook, если статус изменился
      if (updates.status !== undefined) { updates.status = normalizeCrmStatus(updates.status); }
  if (updates.status && oldStatus !== updates.status) {
        try {
          applyWarrantyOnClose(req.user.companyId, Number(id), existingOrder, updates);
          handleOrderClosedSideEffects(req.user.companyId, Number(id), oldStatus, updates.status);
        } catch (e) {
          console.error('Ошибка закрытия заказа:', e);
          return res.status(400).json({ error: e.message || 'Ошибка при закрытии заказа' });
        }
        sendWebhookOnStatusChange(req.user.companyId, id, oldStatus, updates.status);
        try {
          addOrderHistoryEvent(req.user.companyId, Number(id), {
            type: 'status',
            message: `Статус изменен: ${oldStatus} → ${updates.status}`,
            meta: { oldStatus, newStatus: updates.status },
            createdByUserId: req.user.id
          });
        } catch (e) {
          console.error('Ошибка записи истории статуса:', e);
        }
        if (isReadyStatus(updates.status) && !isReadyStatus(oldStatus)) {
          const readyOrder = db
            .prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?')
            .get(id, req.user.companyId);
          if (readyOrder) fireOrderSms(req.user.companyId, readyOrder, 'ready', req.user.id);
        }
      }
    }
    
    // Получаем обновленный заказ
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(id, req.user.companyId);

    // Пересчёт статистики клиента по телефону (старый/новый)
    try {
      const newPhone = updatedOrder.phone;
      linkClientToOrder(req.user.companyId, Number(id), newPhone, {
        name: updatedOrder.client,
        email: updates.email || updatedOrder.email || '',
      });
      recalcClientStatsByPhone(req.user.companyId, newPhone);
      if (oldPhone && newPhone && oldPhone !== newPhone) {
        recalcClientStatsByPhone(req.user.companyId, oldPhone);
      }
    } catch (e) {
      console.error('Ошибка пересчёта клиента:', e);
    }
    
    // Получаем поломки заказа
    const orderProblems = db
      .prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(id);
    const orderParts = db
      .prepare('SELECT * FROM order_parts WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(id);
    
    res.json(formatOrderResponse(updatedOrder, orderProblems, orderParts));
  } catch (error) {
    console.error('Ошибка обновления заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления заказа' });
  }
});

// Удаление заказа
router.delete('/:id', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const order = db.prepare('SELECT id, phone FROM orders WHERE id = ? AND companyId = ?').get(id, companyId);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    let deletedPayments = 0;
    const tx = db.transaction(() => {
      deletedPayments = deletePaymentsForOrder(companyId, order.id);
      db.prepare('DELETE FROM orders WHERE id = ? AND companyId = ?').run(id, companyId);
      if (order.phone) recalcClientStatsByPhone(companyId, order.phone);
    });
    tx();

    res.json({ message: 'Заказ удален', deletedPayments });
  } catch (error) {
    console.error('Ошибка удаления заказа:', error);
    res.status(500).json({ error: 'Ошибка удаления заказа' });
  }
});

module.exports = router;
module.exports.recalcClientStatsByPhone = recalcClientStatsByPhone;