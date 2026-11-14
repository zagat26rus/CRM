const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { ensureOrderPublicToken } = require('./publicTrack');

router.use(requireAuth);

function toInt(value, fallback = 0) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Получить шаблоны квитанций
router.get('/templates', (req, res) => {
  try {
    const { type = '' } = req.query;
    const typeFilter = String(type || '').trim();
    
    let query = 'SELECT * FROM invoice_templates WHERE companyId = ?';
    const params = [req.user.companyId];
    
    if (typeFilter) {
      query += ' AND type = ?';
      params.push(typeFilter);
    }
    
    query += ' ORDER BY isDefault DESC, name ASC';
    
    const templates = db.prepare(query).all(...params);
    
    res.json(templates.map(t => ({
      ...t,
      isDefault: Boolean(t.isDefault),
      isActive: Boolean(t.isActive),
      additionalFields: t.additionalFields ? JSON.parse(t.additionalFields) : [],
      displaySettings: t.displaySettings ? JSON.parse(t.displaySettings) : {
        showCostPrice: false,
        showAdditionalFields: true,
        showClientInfo: true,
        showDeviceInfo: true,
        showDescription: true
      }
    })));
  } catch (error) {
    console.error('Ошибка получения шаблонов:', error);
    res.status(500).json({ error: 'Ошибка получения шаблонов' });
  }
});

// Получить шаблон по ID
router.get('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    const template = db.prepare('SELECT * FROM invoice_templates WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!template) {
      return res.status(404).json({ error: 'Шаблон не найден' });
    }
    
    res.json({
      ...template,
      isDefault: Boolean(template.isDefault),
      isActive: Boolean(template.isActive),
      additionalFields: template.additionalFields ? JSON.parse(template.additionalFields) : [],
      displaySettings: template.displaySettings ? JSON.parse(template.displaySettings) : {
        showCostPrice: false,
        showAdditionalFields: true,
        showClientInfo: true,
        showDeviceInfo: true,
        showDescription: true
      }
    });
  } catch (error) {
    console.error('Ошибка получения шаблона:', error);
    res.status(500).json({ error: 'Ошибка получения шаблона' });
  }
});

// Создать шаблон
router.post('/templates', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const {
      name,
      type = 'invoice',
      template = '',
      companyName = '',
      companyAddress = '',
      companyPhone = '',
      companyEmail = '',
      companyInn = '',
      companyKpp = '',
      additionalFields = [],
      footerText = '',
      displaySettings = {},
      isDefault = false,
      isActive = true
    } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название шаблона обязательно' });
    }
    
    const now = getCurrentTime();
    
    // Если это шаблон по умолчанию, снимаем флаг с других шаблонов того же типа
    if (isDefault) {
      db.prepare('UPDATE invoice_templates SET isDefault = 0 WHERE companyId = ? AND type = ?')
        .run(req.user.companyId, type);
    }
    
    const defaultDisplaySettings = {
      showCostPrice: false,
      showAdditionalFields: true,
      showClientInfo: true,
      showDeviceInfo: true,
      showDescription: true
    };
    const finalDisplaySettings = { ...defaultDisplaySettings, ...displaySettings };
    
    const result = db.prepare(`
      INSERT INTO invoice_templates (
        companyId, name, type, template, companyName, companyAddress, companyPhone,
        companyEmail, companyInn, companyKpp, additionalFields, footerText, displaySettings,
        isDefault, isActive, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.companyId,
      String(name).trim(),
      String(type),
      String(template),
      String(companyName),
      String(companyAddress),
      String(companyPhone),
      String(companyEmail),
      String(companyInn),
      String(companyKpp),
      JSON.stringify(Array.isArray(additionalFields) ? additionalFields : []),
      String(footerText),
      JSON.stringify(finalDisplaySettings),
      isDefault ? 1 : 0,
      isActive ? 1 : 0,
      now,
      now
    );
    
    const newTemplate = db.prepare('SELECT * FROM invoice_templates WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({
      ...newTemplate,
      isDefault: Boolean(newTemplate.isDefault),
      isActive: Boolean(newTemplate.isActive),
      additionalFields: newTemplate.additionalFields ? JSON.parse(newTemplate.additionalFields) : [],
      displaySettings: newTemplate.displaySettings ? JSON.parse(newTemplate.displaySettings) : defaultDisplaySettings
    });
  } catch (error) {
    console.error('Ошибка создания шаблона:', error);
    res.status(500).json({ error: 'Ошибка создания шаблона' });
  }
});

// Обновить шаблон
router.put('/templates/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const template = db.prepare('SELECT * FROM invoice_templates WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!template) {
      return res.status(404).json({ error: 'Шаблон не найден' });
    }
    
    const {
      name,
      type,
      template: templateContent,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyInn,
      companyKpp,
      additionalFields,
      footerText,
      displaySettings,
      isDefault,
      isActive
    } = req.body;
    
    const now = getCurrentTime();
    
    // Если это шаблон по умолчанию, снимаем флаг с других шаблонов того же типа
    if (isDefault !== undefined && isDefault && !template.isDefault) {
      db.prepare('UPDATE invoice_templates SET isDefault = 0 WHERE companyId = ? AND type = ? AND id != ?')
        .run(req.user.companyId, type || template.type, id);
    }
    
    const defaultDisplaySettings = {
      showCostPrice: false,
      showAdditionalFields: true,
      showClientInfo: true,
      showDeviceInfo: true,
      showDescription: true
    };
    const finalDisplaySettings = displaySettings !== undefined 
      ? { ...defaultDisplaySettings, ...displaySettings }
      : (template.displaySettings ? JSON.parse(template.displaySettings) : defaultDisplaySettings);
    
    db.prepare(`
      UPDATE invoice_templates
      SET
        name = ?,
        type = ?,
        template = ?,
        companyName = ?,
        companyAddress = ?,
        companyPhone = ?,
        companyEmail = ?,
        companyInn = ?,
        companyKpp = ?,
        additionalFields = ?,
        footerText = ?,
        displaySettings = ?,
        isDefault = ?,
        isActive = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name !== undefined ? String(name).trim() : template.name,
      type !== undefined ? String(type) : template.type,
      templateContent !== undefined ? String(templateContent) : template.template,
      companyName !== undefined ? String(companyName) : template.companyName,
      companyAddress !== undefined ? String(companyAddress) : template.companyAddress,
      companyPhone !== undefined ? String(companyPhone) : template.companyPhone,
      companyEmail !== undefined ? String(companyEmail) : template.companyEmail,
      companyInn !== undefined ? String(companyInn) : template.companyInn,
      companyKpp !== undefined ? String(companyKpp) : template.companyKpp,
      additionalFields !== undefined ? JSON.stringify(Array.isArray(additionalFields) ? additionalFields : []) : template.additionalFields,
      footerText !== undefined ? String(footerText) : template.footerText,
      JSON.stringify(finalDisplaySettings),
      isDefault !== undefined ? (isDefault ? 1 : 0) : template.isDefault,
      isActive !== undefined ? (isActive ? 1 : 0) : template.isActive,
      now,
      id,
      req.user.companyId
    );
    
    const updated = db.prepare('SELECT * FROM invoice_templates WHERE id = ?').get(id);
    
    res.json({
      ...updated,
      isDefault: Boolean(updated.isDefault),
      isActive: Boolean(updated.isActive),
      additionalFields: updated.additionalFields ? JSON.parse(updated.additionalFields) : [],
      displaySettings: updated.displaySettings ? JSON.parse(updated.displaySettings) : defaultDisplaySettings
    });
  } catch (error) {
    console.error('Ошибка обновления шаблона:', error);
    res.status(500).json({ error: 'Ошибка обновления шаблона' });
  }
});

// Удалить шаблон
router.delete('/templates/:id', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const { id } = req.params;
    const template = db.prepare('SELECT * FROM invoice_templates WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!template) {
      return res.status(404).json({ error: 'Шаблон не найден' });
    }
    
    db.prepare('DELETE FROM invoice_templates WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления шаблона:', error);
    res.status(500).json({ error: 'Ошибка удаления шаблона' });
  }
});

// Получить данные для квитанции заказа на ремонт
router.get('/repair/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND companyId = ?').get(orderId, req.user.companyId);
    
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const publicToken = ensureOrderPublicToken(Number(orderId)) || order.publicToken || null;
    if (publicToken) order.publicToken = publicToken;
    
    // Получаем поломки заказа
    const problems = db
      .prepare('SELECT * FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC')
      .all(orderId);
    
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.companyId);
    
    // Выбор шаблона:
    // 1) default (isDefault=1) + active
    // 2) если default не найден или в нём пустой HTML-макет (template=''), берем самый свежий активный с непустым template
    // 3) иначе берем любой активный (чтобы хоть что-то вернуть во фронт)
    const defaultTemplate = db
      .prepare('SELECT * FROM invoice_templates WHERE companyId = ? AND type = ? AND isDefault = 1 AND isActive = 1')
      .get(req.user.companyId, 'invoice');

    const hasHtml = (t) => t && String(t.template || '').trim().length > 0;

    const latestWithHtml = db
      .prepare(
        `
        SELECT * FROM invoice_templates
        WHERE companyId = ? AND type = ? AND isActive = 1 AND TRIM(COALESCE(template,'')) != ''
        ORDER BY COALESCE(updatedAt, createdAt) DESC, id DESC
        LIMIT 1
      `
      )
      .get(req.user.companyId, 'invoice');

    const anyActive = db
      .prepare(
        `
        SELECT * FROM invoice_templates
        WHERE companyId = ? AND type = ? AND isActive = 1
        ORDER BY isDefault DESC, COALESCE(updatedAt, createdAt) DESC, id DESC
        LIMIT 1
      `
      )
      .get(req.user.companyId, 'invoice');

    const template = hasHtml(defaultTemplate) ? defaultTemplate : (latestWithHtml || defaultTemplate || anyActive || null);
    
    res.json({
      order: {
        ...order,
        warranty: Boolean(order.warranty),
        onSite: Boolean(order.onSite),
        problems: problems.map(p => ({
          id: p.id,
          problemId: p.problemId,
          problemName: p.problemName,
          problemDescription: p.problemDescription,
          price: Number(p.price) || 0,
          costPrice: Number(p.costPrice) || 0
        }))
      },
      company: {
        name: company?.name || '',
        address: company?.address || '',
        phone: company?.phone || '',
        email: company?.email || '',
        inn: company?.inn || '',
        kpp: company?.kpp || ''
      },
      template: template ? {
        ...template,
        isDefault: Boolean(template.isDefault),
        isActive: Boolean(template.isActive),
        additionalFields: template.additionalFields ? JSON.parse(template.additionalFields) : [],
        displaySettings: template.displaySettings ? JSON.parse(template.displaySettings) : {
          showCostPrice: false,
          showAdditionalFields: true,
          showClientInfo: true,
          showDeviceInfo: true,
          showDescription: true
        }
      } : null,
      invoiceDate: getCurrentTime()
    });
  } catch (error) {
    console.error('Ошибка получения квитанции:', error);
    res.status(500).json({ error: 'Ошибка получения квитанции' });
  }
});

module.exports = router;

