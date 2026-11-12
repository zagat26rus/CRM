const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Получить все услуги
router.get('/', (req, res) => {
  try {
    // Проверка существования таблицы
    try {
      db.prepare('SELECT 1 FROM services LIMIT 1').get();
    } catch (tableError) {
      console.error('Таблица services не существует:', tableError);
      return res.json([]); // Возвращаем пустой массив, если таблицы нет
    }
    
    // Проверка и добавление недостающих колонок
    const columnsToAdd = [
      { name: 'description', type: 'TEXT DEFAULT ""' },
      { name: 'sortOrder', type: 'INTEGER DEFAULT 0' },
      { name: 'duration', type: 'INTEGER DEFAULT 0' },
      { name: 'isActive', type: 'BOOLEAN DEFAULT 1' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
      try {
        db.prepare(`SELECT ${col.name} FROM services LIMIT 1`).get();
      } catch (colError) {
        try {
          db.exec(`ALTER TABLE services ADD COLUMN ${col.name} ${col.type};`);
          console.log(`Добавлена колонка ${col.name} в services`);
        } catch (e) {
          console.error(`Ошибка добавления ${col.name}:`, e);
        }
      }
    }
    
    const services = db.prepare(`
      SELECT 
        s.*,
        sc.name as categoryName
      FROM services s
      LEFT JOIN service_categories sc ON s.categoryId = sc.id
      WHERE s.companyId = ?
      ORDER BY COALESCE(s.sortOrder, 0) ASC, s.name ASC
    `).all(req.user.companyId);
    
    res.json(services.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      categoryId: s.categoryId,
      categoryName: s.categoryName || null,
      price: Number(s.price) || 0,
      duration: s.duration || 0,
      isActive: Boolean(s.isActive),
      sortOrder: s.sortOrder || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    })));
  } catch (error) {
    console.error('Ошибка получения услуг:', error);
    res.status(500).json({ error: `Ошибка получения услуг: ${error.message}` });
  }
});

// Получить категории услуг
router.get('/categories', (req, res) => {
  try {
    // Проверка существования таблицы
    try {
      db.prepare('SELECT 1 FROM service_categories LIMIT 1').get();
    } catch (tableError) {
      console.error('Таблица service_categories не существует:', tableError);
      return res.json([]); // Возвращаем пустой массив, если таблицы нет
    }
    
    // Проверка и добавление недостающих колонок
    const columnsToAdd = [
      { name: 'description', type: 'TEXT DEFAULT ""' },
      { name: 'sortOrder', type: 'INTEGER DEFAULT 0' },
      { name: 'isActive', type: 'BOOLEAN DEFAULT 1' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
      try {
        db.prepare(`SELECT ${col.name} FROM service_categories LIMIT 1`).get();
      } catch (colError) {
        try {
          db.exec(`ALTER TABLE service_categories ADD COLUMN ${col.name} ${col.type};`);
          console.log(`Добавлена колонка ${col.name} в service_categories`);
        } catch (e) {
          console.error(`Ошибка добавления ${col.name}:`, e);
        }
      }
    }
    
    const categories = db.prepare(`
      SELECT * FROM service_categories
      WHERE companyId = ?
      ORDER BY COALESCE(sortOrder, 0) ASC, name ASC
    `).all(req.user.companyId);
    
    res.json(categories.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      sortOrder: c.sortOrder || 0,
      isActive: Boolean(c.isActive),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })));
  } catch (error) {
    console.error('Ошибка получения категорий услуг:', error);
    res.status(500).json({ error: `Ошибка получения категорий услуг: ${error.message}` });
  }
});

// Создать категорию услуг
router.post('/categories', (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }
    
    // Проверка существования таблицы
    try {
      db.prepare('SELECT 1 FROM service_categories LIMIT 1').get();
    } catch (tableError) {
      console.error('Таблица service_categories не существует:', tableError);
      return res.status(500).json({ error: 'Таблица service_categories не найдена. Выполните миграцию БД.' });
    }
    
    // Проверка на дубликат
    let existing;
    try {
      existing = db.prepare(`
        SELECT id FROM service_categories 
        WHERE companyId = ? AND name = ?
      `).get(req.user.companyId, name.trim());
    } catch (checkError) {
      console.error('Ошибка проверки дубликата:', checkError);
      // Игнорируем ошибку проверки, продолжаем создание
    }
    
    if (existing) {
      return res.status(400).json({ error: 'Категория с таким названием уже существует' });
    }
    
    // Проверка и добавление недостающих колонок перед INSERT
    const columnsToAdd = [
      { name: 'description', type: 'TEXT DEFAULT ""' },
      { name: 'sortOrder', type: 'INTEGER DEFAULT 0' },
      { name: 'isActive', type: 'BOOLEAN DEFAULT 1' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
      try {
        db.prepare(`SELECT ${col.name} FROM service_categories LIMIT 1`).get();
      } catch (colError) {
        try {
          db.exec(`ALTER TABLE service_categories ADD COLUMN ${col.name} ${col.type};`);
          console.log(`Добавлена колонка ${col.name} в service_categories`);
        } catch (e) {
          console.error(`Ошибка добавления ${col.name}:`, e);
        }
      }
    }
    
    const now = getCurrentTime();
    let result;
    try {
      result = db.prepare(`
        INSERT INTO service_categories (companyId, name, description, sortOrder, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.companyId,
        name.trim(),
        description || '',
        0,
        1,
        now,
        now
      );
    } catch (insertError) {
      console.error('Ошибка INSERT в service_categories:', insertError);
      console.error('Детали:', {
        companyId: req.user.companyId,
        name: name.trim(),
        error: insertError.message
      });
      return res.status(500).json({ error: `Ошибка создания категории: ${insertError.message}` });
    }
    
    const category = db.prepare('SELECT * FROM service_categories WHERE id = ?').get(result.lastInsertRowid);
    
    if (!category) {
      return res.status(500).json({ error: 'Категория создана, но не найдена' });
    }
    
    res.status(201).json({
      id: category.id,
      name: category.name,
      description: category.description || '',
      sortOrder: category.sortOrder || 0,
      isActive: Boolean(category.isActive),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    });
  } catch (error) {
    console.error('Ошибка создания категории услуг:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: `Ошибка создания категории услуг: ${error.message}` });
  }
});

// Обновить категорию услуг
router.put('/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, isActive } = req.body;
    
    const category = db.prepare('SELECT * FROM service_categories WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Название категории обязательно' });
    }
    
    // Проверка на дубликат (если название изменилось)
    if (name && name.trim() !== category.name) {
      const existing = db.prepare(`
        SELECT id FROM service_categories 
        WHERE companyId = ? AND name = ? AND id != ?
      `).get(req.user.companyId, name.trim(), id);
      
      if (existing) {
        return res.status(400).json({ error: 'Категория с таким названием уже существует' });
      }
    }
    
    const now = getCurrentTime();
    db.prepare(`
      UPDATE service_categories
      SET 
        name = ?,
        description = ?,
        sortOrder = ?,
        isActive = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name !== undefined ? name.trim() : category.name,
      description !== undefined ? description : category.description,
      sortOrder !== undefined ? sortOrder : category.sortOrder,
      isActive !== undefined ? (isActive ? 1 : 0) : category.isActive,
      now,
      id,
      req.user.companyId
    );
    
    const updated = db.prepare('SELECT * FROM service_categories WHERE id = ?').get(id);
    
    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description || '',
      sortOrder: updated.sortOrder || 0,
      isActive: Boolean(updated.isActive),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    console.error('Ошибка обновления категории услуг:', error);
    res.status(500).json({ error: 'Ошибка обновления категории услуг' });
  }
});

// Удалить категорию услуг
router.delete('/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const category = db.prepare('SELECT * FROM service_categories WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    // Проверяем, есть ли услуги в этой категории
    const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services WHERE categoryId = ?').get(id);
    
    if (servicesCount.count > 0) {
      return res.status(400).json({ error: 'Нельзя удалить категорию, в которой есть услуги' });
    }
    
    db.prepare('DELETE FROM service_categories WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления категории услуг:', error);
    res.status(500).json({ error: 'Ошибка удаления категории услуг' });
  }
});

// Создать услугу
router.post('/', (req, res) => {
  try {
    const { name, description, categoryId, price, duration } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название услуги обязательно' });
    }
    
    if (price !== undefined && (isNaN(price) || price < 0)) {
      return res.status(400).json({ error: 'Цена должна быть неотрицательным числом' });
    }
    
    // Проверка категории, если указана
    if (categoryId) {
      const category = db.prepare('SELECT id FROM service_categories WHERE id = ? AND companyId = ?').get(categoryId, req.user.companyId);
      if (!category) {
        return res.status(400).json({ error: 'Категория не найдена' });
      }
    }
    
    const now = getCurrentTime();
    const result = db.prepare(`
      INSERT INTO services (companyId, categoryId, name, description, price, duration, isActive, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.companyId,
      categoryId || null,
      name.trim(),
      description || '',
      price || 0,
      duration || 0,
      1,
      0,
      now,
      now
    );
    
    const service = db.prepare(`
      SELECT 
        s.*,
        sc.name as categoryName
      FROM services s
      LEFT JOIN service_categories sc ON s.categoryId = sc.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);
    
    res.status(201).json({
      id: service.id,
      name: service.name,
      description: service.description || '',
      categoryId: service.categoryId,
      categoryName: service.categoryName || null,
      price: Number(service.price) || 0,
      duration: service.duration || 0,
      isActive: Boolean(service.isActive),
      sortOrder: service.sortOrder || 0,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    });
  } catch (error) {
    console.error('Ошибка создания услуги:', error);
    res.status(500).json({ error: 'Ошибка создания услуги' });
  }
});

// Обновить услугу
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, categoryId, price, duration, isActive, sortOrder } = req.body;
    
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }
    
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Название услуги обязательно' });
    }
    
    if (price !== undefined && (isNaN(price) || price < 0)) {
      return res.status(400).json({ error: 'Цена должна быть неотрицательным числом' });
    }
    
    // Проверка категории, если указана
    if (categoryId !== undefined && categoryId !== null) {
      const category = db.prepare('SELECT id FROM service_categories WHERE id = ? AND companyId = ?').get(categoryId, req.user.companyId);
      if (!category) {
        return res.status(400).json({ error: 'Категория не найдена' });
      }
    }
    
    const now = getCurrentTime();
    db.prepare(`
      UPDATE services
      SET 
        categoryId = ?,
        name = ?,
        description = ?,
        price = ?,
        duration = ?,
        isActive = ?,
        sortOrder = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      categoryId !== undefined ? categoryId : service.categoryId,
      name !== undefined ? name.trim() : service.name,
      description !== undefined ? description : service.description,
      price !== undefined ? price : service.price,
      duration !== undefined ? duration : service.duration,
      isActive !== undefined ? (isActive ? 1 : 0) : service.isActive,
      sortOrder !== undefined ? sortOrder : service.sortOrder,
      now,
      id,
      req.user.companyId
    );
    
    const updated = db.prepare(`
      SELECT 
        s.*,
        sc.name as categoryName
      FROM services s
      LEFT JOIN service_categories sc ON s.categoryId = sc.id
      WHERE s.id = ?
    `).get(id);
    
    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description || '',
      categoryId: updated.categoryId,
      categoryName: updated.categoryName || null,
      price: Number(updated.price) || 0,
      duration: updated.duration || 0,
      isActive: Boolean(updated.isActive),
      sortOrder: updated.sortOrder || 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    console.error('Ошибка обновления услуги:', error);
    res.status(500).json({ error: 'Ошибка обновления услуги' });
  }
});

// Удалить услугу
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    
    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }
    
    db.prepare('DELETE FROM services WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления услуги:', error);
    res.status(500).json({ error: 'Ошибка удаления услуги' });
  }
});

module.exports = router;
