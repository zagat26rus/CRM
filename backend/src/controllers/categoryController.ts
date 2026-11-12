import { Request, Response } from 'express';
import { Category } from '../models/Category';

export const categoryController = {
  async getAll(req: Request, res: Response) {
    try {
      const categories = Category.findAll({ isActive: true });
      res.json(categories);
    } catch (error: any) {
      console.error('Ошибка получения категорий:', error);
      res.status(500).json({ error: 'Ошибка получения категорий: ' + error.message });
    }
  },

  async getByType(req: Request, res: Response) {
    try {
      const { type } = req.params;
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'Неверный тип категории' });
      }
      
      const categories = Category.findByType(type as 'income' | 'expense');
      res.json(categories);
    } catch (error: any) {
      console.error('Ошибка получения категорий по типу:', error);
      res.status(500).json({ error: 'Ошибка получения категорий: ' + error.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { name, type, description, color, icon } = req.body;
      
      if (!name || !type) {
        return res.status(400).json({ error: 'Название и тип обязательны' });
      }
      
      // Проверяем существование
      const existing = Category.findAll({ name, type });
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Категория уже существует' });
      }
      
      const category = Category.create({
        name,
        type,
        description,
        color,
        icon
      });
      
      res.status(201).json(category);
    } catch (error: any) {
      console.error('Ошибка создания категории:', error);
      res.status(500).json({ error: 'Ошибка создания категории: ' + error.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const category = Category.update(Number(id), updates);
      if (!category) {
        return res.status(404).json({ error: 'Категория не найдена' });
      }
      
      res.json(category);
    } catch (error: any) {
      console.error('Ошибка обновления категории:', error);
      res.status(500).json({ error: 'Ошибка обновления категории: ' + error.message });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      Category.delete(Number(id));
      res.json({ message: 'Категория удалена' });
    } catch (error: any) {
      console.error('Ошибка удаления категории:', error);
      res.status(400).json({ error: error.message });
    }
  }
};