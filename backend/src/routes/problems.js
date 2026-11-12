const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Получение всех поломок
router.get('/', (req, res) => {
  try {
    const { deviceType } = req.query;
    
    let sql = 'SELECT * FROM common_problems WHERE companyId = ?';
    let params = [req.user.companyId];
    
    if (deviceType) {
      sql += ' AND deviceType = ?';
      params.push(deviceType);
    }
    
    sql += ' ORDER BY name';
    
    const problems = db.prepare(sql).all(...params);
    res.json(problems);
  } catch (error) {
    console.error('Ошибка получения поломок:', error);
    res.status(500).json({ error: 'Ошибка получения поломок' });
  }
});

// Создание поломки
router.post('/', (req, res) => {
  try {
    const { name, description, defaultCostPrice, defaultPrice, deviceType } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Название поломки обязательно' });
    }

    // Проверка уникальности
    const existing = db.prepare('SELECT id FROM common_problems WHERE companyId = ? AND name = ?').get(req.user.companyId, name);
    if (existing) {
      return res.status(400).json({ error: 'Поломка с таким названием уже существует' });
    }
    
    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO common_problems (companyId, name, description, defaultCostPrice, defaultPrice, deviceType, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      req.user.companyId,
      name,
      description || '',
      Number(defaultCostPrice) || 0,
      Number(defaultPrice) || 0,
      deviceType || 'Смартфон',
      now
    );
    
    const newProblem = db.prepare('SELECT * FROM common_problems WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newProblem);
  } catch (error) {
    console.error('Ошибка создания поломки:', error);
    res.status(500).json({ error: 'Ошибка создания поломки' });
  }
});

module.exports = router;
