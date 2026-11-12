const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Получение всех задач с фильтрами
router.get('/', (req, res) => {
  try {
    const { 
      status,
      type,
      priority,
      assignedTo,
      orderId,
      dueDate,
      title,
      isCompleted,
      page = 1,
      limit = 100
    } = req.query;
    
    let conditions = ['t.companyId = ?'];
    let params = [req.user.companyId];
    
    if (status && status !== 'all') {
      conditions.push('t.status = ?');
      params.push(status);
    }
    
    if (type && type !== 'all') {
      conditions.push('t.type = ?');
      params.push(type);
    }
    
    if (priority && priority !== 'all') {
      conditions.push('t.priority = ?');
      params.push(priority);
    }
    
    if (assignedTo && assignedTo !== 'all') {
      conditions.push('t.assignedTo = ?');
      params.push(assignedTo);
    }
    
    if (orderId) {
      conditions.push('t.orderId = ?');
      params.push(orderId);
    }
    
    if (dueDate) {
      if (dueDate === 'today') {
        const today = new Date().toISOString().split('T')[0];
        conditions.push('t.dueDate = ?');
        params.push(today);
      } else if (dueDate === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        conditions.push('t.dueDate < ? AND t.isCompleted = 0');
        params.push(today);
      } else {
        conditions.push('t.dueDate = ?');
        params.push(dueDate);
      }
    }
    
    if (title) {
      conditions.push('t.title LIKE ?');
      params.push(`%${title}%`);
    }
    
    if (isCompleted !== undefined) {
      conditions.push('t.isCompleted = ?');
      params.push(isCompleted === 'true' ? 1 : 0);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Получить общее количество
    const countSql = `SELECT COUNT(*) as total FROM tasks t ${whereClause}`;
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;
    
    // Получить данные
    const offset = (page - 1) * limit;
    const tasks = db.prepare(`
      SELECT 
        t.*,
        o.client as orderClient,
        o.phone as orderPhone
      FROM tasks t
      LEFT JOIN orders o ON t.orderId = o.id AND o.companyId = t.companyId
      ${whereClause}
      ORDER BY 
        CASE t.priority 
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END,
        t.dueDate ASC,
        t.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    // Преобразуем boolean значения
    const formattedTasks = tasks.map(task => ({
      ...task,
      isCompleted: Boolean(task.isCompleted)
    }));
    
    res.json({
      tasks: formattedTasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения задач:', error);
    res.status(500).json({ error: 'Ошибка получения задач', details: error.message });
  }
});

// Статистика по задачам (ВАЖНО: до /:id)
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalTasks: 0,
      newTasks: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      today: 0,
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0
    };

    // Получаем базовую статистику
    const totalResult = db
      .prepare('SELECT COUNT(*) as total FROM tasks WHERE companyId = ?')
      .get(req.user.companyId);
    stats.totalTasks = totalResult.total || 0;

    // Статистика по статусам
    const statusCounts = db.prepare(`
      SELECT t.status, COUNT(*) as count
      FROM tasks t
      WHERE t.companyId = ?
      GROUP BY t.status
    `).all(req.user.companyId);

    statusCounts.forEach(row => {
      if (row.status === 'new') stats.newTasks = row.count;
      if (row.status === 'in_progress') stats.inProgress = row.count;
      if (row.status === 'completed') stats.completed = row.count;
    });

    // Статистика по приоритетам
    const priorityCounts = db.prepare(`
      SELECT t.priority, COUNT(*) as count
      FROM tasks t
      WHERE t.companyId = ?
      GROUP BY t.priority
    `).all(req.user.companyId);

    priorityCounts.forEach(row => {
      if (row.priority === 'high') stats.highPriority = row.count;
      if (row.priority === 'medium') stats.mediumPriority = row.count;
      if (row.priority === 'low') stats.lowPriority = row.count;
    });

    // Просроченные задачи
    const today = new Date().toISOString().split('T')[0];
    const overdueResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks t
      WHERE t.companyId = ? AND t.dueDate < ? AND t.isCompleted = 0 AND t.dueDate IS NOT NULL
    `).get(req.user.companyId, today);
    stats.overdue = overdueResult.count || 0;

    // Задачи на сегодня
    const todayResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks t
      WHERE t.companyId = ? AND t.dueDate = ? AND t.isCompleted = 0
    `).get(req.user.companyId, today);
    stats.today = todayResult.count || 0;

    res.json(stats);
  } catch (error) {
    console.error('Ошибка получения статистики задач:', error);
    res.status(500).json({ error: 'Ошибка получения статистики задач' });
  }
});

// Получение одной задачи
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const task = db.prepare(`
      SELECT 
        t.*,
        o.client as orderClient,
        o.phone as orderPhone
      FROM tasks t
      LEFT JOIN orders o ON t.orderId = o.id AND o.companyId = t.companyId
      WHERE t.id = ? AND t.companyId = ?
    `).get(id, req.user.companyId);
    
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    // Преобразуем boolean значения
    const formattedTask = {
      ...task,
      isCompleted: Boolean(task.isCompleted)
    };
    
    res.json(formattedTask);
  } catch (error) {
    console.error('Ошибка получения задачи:', error);
    res.status(500).json({ error: 'Ошибка получения задачи' });
  }
});

// Создание задачи
router.post('/', (req, res) => {
  try {
    const { 
      title,
      description = '',
      type = 'general',
      priority = 'medium',
      status = 'new',
      orderId = null,
      assignedTo = '',
      dueDate = null,
      reminderTime = null,
      isCompleted = false
    } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Название задачи обязательно' });
    }
    
    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO tasks (
        companyId, title, description, type, priority, status, orderId, 
        assignedTo, dueDate, reminderTime, isCompleted, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      req.user.companyId,
      title,
      description,
      type,
      priority,
      status,
      orderId,
      assignedTo,
      dueDate,
      reminderTime,
      isCompleted ? 1 : 0,
      now,
      now
    );
    
    const newTask = db.prepare(`
      SELECT 
        t.*,
        o.client as orderClient,
        o.phone as orderPhone
      FROM tasks t
      LEFT JOIN orders o ON t.orderId = o.id AND o.companyId = t.companyId
      WHERE t.id = ? AND t.companyId = ?
    `).get(result.lastInsertRowid, req.user.companyId);
    
    // Преобразуем boolean значения
    const formattedTask = {
      ...newTask,
      isCompleted: Boolean(newTask.isCompleted)
    };
    
    res.status(201).json(formattedTask);
  } catch (error) {
    console.error('Ошибка создания задачи:', error);
    res.status(500).json({ error: 'Ошибка создания задачи' });
  }
});

// Обновление задачи
// Обновление задачи
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Проверяем существование задачи
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    // Если задача помечается как выполненная
    if (updates.isCompleted && !existingTask.isCompleted) {
      updates.completedAt = getCurrentTime();
      updates.status = 'completed';
    }
    
    // Если задача снимается с выполнения
    if (updates.isCompleted === false && existingTask.isCompleted) {
      updates.completedAt = null;
      updates.status = 'new';
    }
    
const allowedFields = ['title', 'description', 'type', 'priority', 'status', 
                      'orderId', 'assignedTo', 'dueDate', 'reminderTime', 
                      'isCompleted', 'completedAt'];
    
    const fields = [];
    const params = [];
    const now = getCurrentTime();
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined && updates[field] !== null) {
        fields.push(`${field} = ?`);
        
        if (field === 'isCompleted') {
          params.push(updates[field] ? 1 : 0);
        } else {
          params.push(updates[field]);
        }
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    
    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);
    
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND companyId = ?`;
    console.log('SQL обновления:', sql, params); // Для отладки
    
    try {
      db.prepare(sql).run(...params, req.user.companyId);
    } catch (sqlError) {
      console.error('SQL ошибка:', sqlError.message);
      console.error('Запрос:', sql);
      console.error('Параметры:', params);
      throw sqlError;
    }
    
    // Получаем обновленную задачу
    const updatedTask = db.prepare(`
      SELECT 
        t.*,
        o.client as orderClient,
        o.phone as orderPhone
      FROM tasks t
      LEFT JOIN orders o ON t.orderId = o.id AND o.companyId = t.companyId
      WHERE t.id = ? AND t.companyId = ?
    `).get(id, req.user.companyId);
    
    // Преобразуем boolean значения для ответа
    const formattedTask = {
      ...updatedTask,
      isCompleted: Boolean(updatedTask.isCompleted)
    };
    
    res.json(formattedTask);
  } catch (error) {
    console.error('Ошибка обновления задачи:', error);
    res.status(500).json({ 
      error: 'Ошибка обновления задачи', 
      details: error.message 
    });
  }
});

// Удаление задачи
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ? AND companyId = ?');
    const result = stmt.run(id, req.user.companyId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    res.json({ message: 'Задача удалена' });
  } catch (error) {
    console.error('Ошибка удаления задачи:', error);
    res.status(500).json({ error: 'Ошибка удаления задачи' });
  }
});

module.exports = router;