const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');
const crypto = require('crypto');

// Все роуты требуют авторизации
router.use(requireAuth);

// Только owner и admin могут управлять интеграциями
router.use(requireRole(['owner', 'admin']));

// Генерация API ключа
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Получение всех интеграций компании
router.get('/', (req, res) => {
  try {
    const integrations = db.prepare(`
      SELECT * FROM integrations 
      WHERE companyId = ? 
      ORDER BY createdAt DESC
    `).all(req.user.companyId);
    
    res.json(integrations);
  } catch (error) {
    console.error('Ошибка получения интеграций:', error);
    res.status(500).json({ error: 'Ошибка получения интеграций' });
  }
});

// Получение одной интеграции
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const integration = db.prepare(`
      SELECT * FROM integrations 
      WHERE id = ? AND companyId = ?
    `).get(id, req.user.companyId);
    
    if (!integration) {
      return res.status(404).json({ error: 'Интеграция не найдена' });
    }
    
    res.json(integration);
  } catch (error) {
    console.error('Ошибка получения интеграции:', error);
    res.status(500).json({ error: 'Ошибка получения интеграции' });
  }
});

// Создание интеграции
router.post('/', (req, res) => {
  try {
    const { 
      name, 
      serviceCenterId = null,
      webhookUrl = '',
      webhookSecret = '',
      isActive = true 
    } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название интеграции обязательно' });
    }
    
    const now = getCurrentTime();
    const apiKey = generateApiKey();
    
    const result = db.prepare(`
      INSERT INTO integrations (
        companyId, name, serviceCenterId, apiKey, 
        webhookUrl, webhookSecret, isActive, 
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.companyId,
      name.trim(),
      serviceCenterId,
      apiKey,
      webhookUrl.trim(),
      webhookSecret.trim(),
      isActive ? 1 : 0,
      now,
      now
    );
    
    const newIntegration = db.prepare(`
      SELECT * FROM integrations WHERE id = ?
    `).get(result.lastInsertRowid);
    
    res.status(201).json({
      ...newIntegration,
      isActive: Boolean(newIntegration.isActive)
    });
  } catch (error) {
    console.error('Ошибка создания интеграции:', error);
    res.status(500).json({ error: 'Ошибка создания интеграции' });
  }
});

// Обновление интеграции
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      serviceCenterId,
      webhookUrl,
      webhookSecret,
      isActive,
      regenerateApiKey = false
    } = req.body;
    
    // Проверяем существование интеграции
    const existing = db.prepare(`
      SELECT * FROM integrations 
      WHERE id = ? AND companyId = ?
    `).get(id, req.user.companyId);
    
    if (!existing) {
      return res.status(404).json({ error: 'Интеграция не найдена' });
    }
    
    const now = getCurrentTime();
    let apiKey = existing.apiKey;
    
    // Регенерировать ключ если запрошено
    if (regenerateApiKey) {
      apiKey = generateApiKey();
    }
    
    // Обновляем поля
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Название не может быть пустым' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    
    if (serviceCenterId !== undefined) {
      updates.push('serviceCenterId = ?');
      params.push(serviceCenterId);
    }
    
    if (webhookUrl !== undefined) {
      updates.push('webhookUrl = ?');
      params.push(webhookUrl.trim());
    }
    
    if (webhookSecret !== undefined) {
      updates.push('webhookSecret = ?');
      params.push(webhookSecret.trim());
    }
    
    if (isActive !== undefined) {
      updates.push('isActive = ?');
      params.push(isActive ? 1 : 0);
    }
    
    if (regenerateApiKey) {
      updates.push('apiKey = ?');
      params.push(apiKey);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    
    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);
    params.push(req.user.companyId);
    
    db.prepare(`
      UPDATE integrations 
      SET ${updates.join(', ')} 
      WHERE id = ? AND companyId = ?
    `).run(...params);
    
    const updated = db.prepare(`
      SELECT * FROM integrations WHERE id = ?
    `).get(id);
    
    res.json({
      ...updated,
      isActive: Boolean(updated.isActive)
    });
  } catch (error) {
    console.error('Ошибка обновления интеграции:', error);
    res.status(500).json({ error: 'Ошибка обновления интеграции' });
  }
});

// Удаление интеграции
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const result = db.prepare(`
      DELETE FROM integrations 
      WHERE id = ? AND companyId = ?
    `).run(id, req.user.companyId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Интеграция не найдена' });
    }
    
    res.json({ message: 'Интеграция удалена' });
  } catch (error) {
    console.error('Ошибка удаления интеграции:', error);
    res.status(500).json({ error: 'Ошибка удаления интеграции' });
  }
});

module.exports = router;




