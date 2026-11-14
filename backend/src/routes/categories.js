const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Получение всех категорий
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT * FROM categories 
      WHERE companyId = ? AND isActive = 1
      ORDER BY isDefault DESC, name ASC
    `).all(req.user.companyId);
    
    res.json(categories.map(cat => ({
      ...cat,
      isActive: Boolean(cat.isActive),
      isDefault: Boolean(cat.isDefault)
    })));
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

module.exports = router;