import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import { Category } from '../models/Category';

export const paymentController = {
  async getAll(req: Request, res: Response) {
    try {
      const { 
        type, 
        categoryId, 
        startDate, 
        endDate,
        page = '1',
        limit = '50'
      } = req.query;
      
      const filters: any = {};
      if (type && ['income', 'expense'].includes(type as string)) {
        filters.type = type;
      }
      if (categoryId) {
        filters.categoryId = categoryId;
      }
      if (startDate) {
        filters.startDate = startDate;
      }
      if (endDate) {
        filters.endDate = endDate;
      }
      
      const result = Payment.findAll(
        filters, 
        Number(page), 
        Number(limit)
      );
      
      res.json(result);
    } catch (error: any) {
      console.error('Ошибка получения платежей:', error);
      res.status(500).json({ error: 'Ошибка получения платежей: ' + error.message });
    }
  },

  async getStats(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      
      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      
      const stats = Payment.getStats(filters);
      res.json(stats);
    } catch (error: any) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Ошибка получения статистики: ' + error.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { amount, type, categoryId, description, date, tags, attachments } = req.body;
      
      if (!amount || !type || !categoryId || !description) {
        return res.status(400).json({ error: 'Заполните все обязательные поля' });
      }
      
      // Проверка категории
      const category = Category.findById(categoryId);
      if (!category) {
        return res.status(400).json({ error: 'Категория не найдена' });
      }
      
      if (category.type !== type) {
        return res.status(400).json({ error: 'Тип категории не совпадает с типом платежа' });
      }
      
      const payment = Payment.create({
        amount: Number(amount),
        type,
        categoryId: Number(categoryId),
        description,
        date,
        tags,
        attachments
      });
      
      res.status(201).json(payment);
    } catch (error: any) {
      console.error('Ошибка создания платежа:', error);
      res.status(500).json({ error: 'Ошибка создания платежа: ' + error.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      if (updates.categoryId) {
        const category = Category.findById(updates.categoryId);
        if (!category) {
          return res.status(400).json({ error: 'Категория не найдена' });
        }
      }
      
      const payment = Payment.update(Number(id), updates);
      if (!payment) {
        return res.status(404).json({ error: 'Платеж не найден' });
      }
      
      res.json(payment);
    } catch (error: any) {
      console.error('Ошибка обновления платежа:', error);
      res.status(500).json({ error: 'Ошибка обновления платежа: ' + error.message });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const deleted = Payment.delete(Number(id));
      if (!deleted) {
        return res.status(404).json({ error: 'Платеж не найден' });
      }
      
      res.json({ message: 'Платеж удален' });
    } catch (error: any) {
      console.error('Ошибка удаления платежа:', error);
      res.status(500).json({ error: 'Ошибка удаления платежа: ' + error.message });
    }
  }
};