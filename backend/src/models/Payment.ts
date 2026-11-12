import { db, dbHelper } from '../db-sqlite';

export interface IPayment {
  id?: number;
  amount: number;
  type: 'income' | 'expense';
  categoryId: number;
  category?: any;
  description: string;
  date?: string;
  userId?: number | null;
  attachments?: string[];
  tags?: string[];
  isConfirmed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface PaymentRow {
  id: number;
  amount: number;
  type: 'income' | 'expense';
  categoryId: number;
  description: string;
  date: string;
  userId: number | null;
  attachments: string;
  tags: string;
  isConfirmed: number;
  createdAt: string;
  updatedAt: string;
  categoryName?: string;
  categoryType?: string;
  categoryColor?: string;
  categoryIcon?: string;
}

export const Payment = {
  // Найти все платежи с пагинацией
  findAll(filters: any = {}, page = 1, limit = 50) {
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (filters.type) {
      conditions.push('p.type = ?');
      params.push(filters.type);
    }
    
    if (filters.categoryId) {
      conditions.push('p.categoryId = ?');
      params.push(filters.categoryId);
    }
    
    if (filters.startDate) {
      conditions.push('p.date >= ?');
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      conditions.push('p.date <= ?');
      params.push(filters.endDate);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Получить общее количество
    const countSql = `
      SELECT COUNT(*) as total FROM payments p
      ${whereClause}
    `;
    const totalResult = db.prepare(countSql).get(...params) as { total: number };
    const total = totalResult?.total || 0;
    
    // Получить данные
    const sql = `
      SELECT 
        p.*,
        c.name as categoryName,
        c.type as categoryType,
        c.color as categoryColor,
        c.icon as categoryIcon
      FROM payments p
      LEFT JOIN categories c ON p.categoryId = c.id
      ${whereClause}
      ORDER BY p.date DESC, p.createdAt DESC
      LIMIT ? OFFSET ?
    `;
    
    const offset = (page - 1) * limit;
    const payments = db.prepare(sql).all(...params, limit, offset) as PaymentRow[];
    
    // Преобразовать данные
    const formattedPayments = payments.map(p => ({
      id: p.id,
      amount: p.amount,
      type: p.type,
      categoryId: p.categoryId,
      description: p.description,
      date: p.date,
      userId: p.userId,
      attachments: dbHelper.parseJSON(p.attachments),
      tags: dbHelper.parseJSON(p.tags),
      isConfirmed: Boolean(p.isConfirmed),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      category: p.categoryId ? {
        id: p.categoryId,
        name: p.categoryName,
        type: p.categoryType,
        color: p.categoryColor,
        icon: p.categoryIcon
      } : null
    }));
    
    return {
      payments: formattedPayments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },

  // Получить статистику
  getStats(filters: any = {}) {
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (filters.startDate) {
      conditions.push('date >= ?');
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      conditions.push('date <= ?');
      params.push(filters.endDate);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const sql = `
      SELECT 
        type,
        SUM(amount) as total,
        COUNT(*) as count
      FROM payments
      ${whereClause}
      GROUP BY type
    `;
    
    const stats = db.prepare(sql).all(...params) as Array<{
      type: string;
      total: number;
      count: number;
    }>;
    
    const income = stats.find(s => s.type === 'income')?.total || 0;
    const expense = stats.find(s => s.type === 'expense')?.total || 0;
    const balance = income - expense;
    
    return {
      income,
      expense,
      balance,
      incomeCount: stats.find(s => s.type === 'income')?.count || 0,
      expenseCount: stats.find(s => s.type === 'expense')?.count || 0
    };
  },

  // Найти по ID
  findById(id: number) {
    const sql = `
      SELECT 
        p.*,
        c.name as categoryName,
        c.type as categoryType,
        c.color as categoryColor,
        c.icon as categoryIcon
      FROM payments p
      LEFT JOIN categories c ON p.categoryId = c.id
      WHERE p.id = ?
    `;
    
    const payment = db.prepare(sql).get(id) as PaymentRow;
    if (!payment) return null;
    
    return {
      id: payment.id,
      amount: payment.amount,
      type: payment.type,
      categoryId: payment.categoryId,
      description: payment.description,
      date: payment.date,
      userId: payment.userId,
      attachments: dbHelper.parseJSON(payment.attachments),
      tags: dbHelper.parseJSON(payment.tags),
      isConfirmed: Boolean(payment.isConfirmed),
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      category: payment.categoryId ? {
        id: payment.categoryId,
        name: payment.categoryName,
        type: payment.categoryType,
        color: payment.categoryColor,
        icon: payment.categoryIcon
      } : null
    };
  },

  // Создать платеж
  create(data: IPayment) {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO payments 
      (amount, type, categoryId, description, date, userId, attachments, tags, isConfirmed, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = db.prepare(sql);
    const result = stmt.run(
      data.amount,
      data.type,
      data.categoryId,
      data.description,
      dbHelper.formatDate(data.date),
      data.userId || null,
      dbHelper.stringifyJSON(data.attachments),
      dbHelper.stringifyJSON(data.tags),
      data.isConfirmed !== false ? 1 : 0,
      now,
      now
    );
    
    return this.findById(result.lastInsertRowid as number);
  },

  // Обновить платеж
  update(id: number, data: Partial<IPayment>) {
    const payment = this.findById(id);
    if (!payment) {
      throw new Error('Платеж не найден');
    }
    
    const now = new Date().toISOString();
    const fields: string[] = [];
    const params: any[] = [];
    
    const updateData: any = { ...data };
    if (updateData.date) {
      updateData.date = dbHelper.formatDate(updateData.date);
    }
    if (updateData.attachments) {
      updateData.attachments = dbHelper.stringifyJSON(updateData.attachments);
    }
    if (updateData.tags) {
      updateData.tags = dbHelper.stringifyJSON(updateData.tags);
    }
    if (updateData.isConfirmed !== undefined) {
      updateData.isConfirmed = updateData.isConfirmed ? 1 : 0;
    }
    
    Object.keys(updateData).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(updateData[key]);
      }
    });
    
    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);
    
    const sql = `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...params);
    
    return this.findById(id);
  },

  // Удалить платеж
  delete(id: number) {
    const sql = 'DELETE FROM payments WHERE id = ?';
    const result = db.prepare(sql).run(id);
    return result.changes > 0;
  }
};