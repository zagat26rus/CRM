const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Получение всех брендов
router.get('/', (req, res) => {
  try {
    const brands = db.prepare('SELECT * FROM brands WHERE companyId = ? ORDER BY name').all(req.user.companyId);
    res.json(brands);
  } catch (error) {
    console.error('Ошибка получения брендов:', error);
    res.status(500).json({ error: 'Ошибка получения брендов' });
  }
});

// Создание бренда
router.post('/', (req, res) => {
  try {
    const { name, icon } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Название бренда обязательно' });
    }
    
    const now = getCurrentTime();
    const stmt = db.prepare('INSERT INTO brands (companyId, name, icon, createdAt) VALUES (?, ?, ?, ?)');
    const result = stmt.run(req.user.companyId, name, icon || '', now);
    
    const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newBrand);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Бренд с таким названием уже существует' });
    }
    console.error('Ошибка создания бренда:', error);
    res.status(500).json({ error: 'Ошибка создания бренда' });
  }
});

// Получение моделей
router.get('/models', (req, res) => {
  try {
    const { brandId } = req.query;
    
    let sql = `
      SELECT m.*, b.name as brandName 
      FROM device_models m
      JOIN brands b ON m.brandId = b.id
      WHERE b.companyId = ?
    `;
    let params = [req.user.companyId];
    
    if (brandId) {
      sql += ' AND m.brandId = ?';
      params.push(brandId);
    }
    
    sql += ' ORDER BY b.name, m.name';
    
    const models = db.prepare(sql).all(...params);
    res.json(models);
  } catch (error) {
    console.error('Ошибка получения моделей:', error);
    res.status(500).json({ error: 'Ошибка получения моделей' });
  }
});

// Создание модели
router.post('/models', (req, res) => {
  try {
    const { brandId, name, deviceType } = req.body;
    
    if (!brandId || !name) {
      return res.status(400).json({ error: 'Бренд и название модели обязательны' });
    }

    // Проверяем, что бренд принадлежит компании
    const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND companyId = ?').get(brandId, req.user.companyId);
    if (!brand) {
      return res.status(404).json({ error: 'Бренд не найден или доступ запрещен' });
    }
    
    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO device_models (brandId, name, deviceType, createdAt)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(brandId, name, deviceType || 'Смартфон', now);
    
    const newModel = db.prepare(`
      SELECT m.*, b.name as brandName 
      FROM device_models m
      JOIN brands b ON m.brandId = b.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
    
    res.status(201).json(newModel);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Модель с таким названием уже существует у этого бренда' });
    }
    console.error('Ошибка создания модели:', error);
    res.status(500).json({ error: 'Ошибка создания модели' });
  }
});

module.exports = router;
