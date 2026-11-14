import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Создаем директорию для БД если нет
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'fixnet-crm.sqlite');
console.log(`📁 База данных: ${dbPath}`);

const db = new Database(dbPath);

// Включить foreign keys
db.pragma('foreign_keys = ON');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#3b82f6',
    icon TEXT DEFAULT '💰',
    isActive BOOLEAN DEFAULT 1,
    userId INTEGER DEFAULT NULL,
    isDefault BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, type, userId)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL CHECK(amount >= 0),
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
    categoryId INTEGER NOT NULL,
    description TEXT NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    userId INTEGER DEFAULT NULL,
    attachments TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    isConfirmed BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
  CREATE INDEX IF NOT EXISTS idx_payments_category ON payments(categoryId);
`);

// Вспомогательные функции
export const dbHelper = {
  parseJSON(text: string | null): any {
    try {
      return text ? JSON.parse(text) : [];
    } catch {
      return [];
    }
  },
  
  stringifyJSON(data: any): string {
    return JSON.stringify(data || []);
  },
  
  formatDate(date?: string | Date): string {
    if (!date) return new Date().toISOString();
    return new Date(date).toISOString();
  }
};

export { db };