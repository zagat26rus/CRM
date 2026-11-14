import { db, dbHelper } from '../db-sqlite';

export interface ICategory {
  id?: number;
  name: string;
  type: 'income' | 'expense';
  description?: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
  userId?: number | null;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const Category = {
  // Найти все категории
  findAll(where: any = {}) {
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (where.type) {
      conditions.push('type = ?');
      params.push(where.type);
    }
    
    if (where.isActive !== undefined) {
      conditions.push('isActive = ?');
      params.push(where.isActive ? 1 : 0);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const sql = `
      SELECT * FROM categories 
      ${whereClause}
      ORDER BY isDefault DESC, name ASC
    `;
    
    const categories = db.prepare(sql).all(...params);
    return categories.map(cat => ({
      ...cat,
      isActive: Boolean(cat.isActive),
      isDefault: Boolean(cat.isDefault)
    }));
  },

  // Найти по ID
  findById(id: number) {
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!category) return null;
    
    return {
      ...category,
      isActive: Boolean(category.isActive),
      isDefault: Boolean(category.isDefault)
    };
  },

  // Найти по типу
  findByType(type: 'income' | 'expense', userId?: number) {
    const sql = `
      SELECT * FROM categories 
      WHERE type = ? AND isActive = 1 
      AND (userId = ? OR userId IS NULL OR isDefault = 1)
      ORDER BY name ASC
    `;
    const categories = db.prepare(sql).all(type, userId || null);
    
    return categories.map(cat => ({
      ...cat,
      isActive: Boolean(cat.isActive),
      isDefault: Boolean(cat.isDefault)
    }));
  },

  // Создать категорию
  create(data: ICategory) {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO categories 
      (name, type, description, color, icon, isActive, userId, isDefault, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = db.prepare(sql);
    const result = stmt.run(
      data.name,
      data.type,
      data.description || '',
      data.color || '#3b82f6',
      data.icon || '💰',
      data.isActive !== false ? 1 : 0,
      data.userId || null,
      data.isDefault ? 1 : 0,
      now,
      now
    );
    
    return this.findById(result.lastInsertRowid as number);
  },

  // Обновить категорию
  update(id: number, data: Partial<ICategory>) {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const params: any[] = [];
    
    const updateData: any = { ...data };
    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive ? 1 : 0;
    }
    
    Object.keys(updateData).forEach(key => {
      if (key !== 'id' && key !== 'isDefault') {
        fields.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });
    
    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);
    
    if (fields.length === 1) { // только updatedAt
      return this.findById(id);
    }
    
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...params);
    
    return this.findById(id);
  },

  // Удалить (мягкое удаление)
  delete(id: number) {
    const category = this.findById(id);
    if (!category) {
      throw new Error('Категория не найдена');
    }
    
    if (category.isDefault) {
      throw new Error('Нельзя удалить системную категорию');
    }
    
    const sql = 'UPDATE categories SET isActive = 0, updatedAt = ? WHERE id = ?';
    db.prepare(sql).run(new Date().toISOString(), id);
    return true;
  },

  // Создать дефолтные категории
  seedDefault() {
    const defaultCategories: ICategory[] = [
      // Доходы
      { name: 'Оплата услуг', type: 'income', icon: '💼', color: '#10b981', isDefault: true },
      { name: 'Аванс', type: 'income', icon: '💰', color: '#3b82f6', isDefault: true },
      { name: 'Возврат', type: 'income', icon: '↩️', color: '#8b5cf6', isDefault: true },
      { name: 'Инвестиции', type: 'income', icon: '📈', color: '#f59e0b', isDefault: true },
      
      // Расходы
      { name: 'Зарплата', type: 'expense', icon: '👨‍💼', color: '#ef4444', isDefault: true },
      { name: 'Аренда', type: 'expense', icon: '🏢', color: '#f97316', isDefault: true },
      { name: 'Запчасти', type: 'expense', icon: '🔧', color: '#6366f1', isDefault: true },
      { name: 'Реклама', type: 'expense', icon: '📢', color: '#8b5cf6', isDefault: true },
      { name: 'Коммунальные', type: 'expense', icon: '💡', color: '#10b981', isDefault: true },
      { name: 'Налоги', type: 'expense', icon: '🏛️', color: '#f59e0b', isDefault: true },
      { name: 'Транспорт', type: 'expense', icon: '🚗', color: '#3b82f6', isDefault: true },
    ];

    // Удаляем старые дефолтные
    db.prepare('DELETE FROM categories WHERE isDefault = 1').run();
    
    // Добавляем новые
    defaultCategories.forEach(cat => this.create(cat));
    
    console.log('✅ Созданы дефолтные категории');
  }
};