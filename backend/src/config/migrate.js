// migrate.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'fixnet-crm.sqlite');
const db = new Database(dbPath);

console.log('🔄 Начинаем миграцию базы данных...');

try {
  // Проверяем существование таблицы tasks
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='tasks'
  `).get();

  if (!tableExists) {
    console.log('❌ Таблица tasks не найдена!');
    db.close();
    process.exit(1);
  }

  // Проверяем существование колонок
  const columns = db.prepare("PRAGMA table_info(tasks)").all();
  console.log('Существующие колонки в tasks:', columns.map(c => c.name));
  
  const hasResult = columns.some(col => col.name === 'result');
  const hasNotes = columns.some(col => col.name === 'notes');
  
  if (!hasResult) {
    console.log('➕ Добавляем колонку result...');
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN result TEXT DEFAULT ''`);
      console.log('✅ Колонка result добавлена');
    } catch (error) {
      console.error('❌ Ошибка добавления result:', error.message);
    }
  }
  
  if (!hasNotes) {
    console.log('➕ Добавляем колонку notes...');
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN notes TEXT DEFAULT ''`);
      console.log('✅ Колонка notes добавлена');
    } catch (error) {
      console.error('❌ Ошибка добавления notes:', error.message);
    }
  }
  
  console.log('✅ Миграция завершена успешно!');
  const updatedColumns = db.prepare("PRAGMA table_info(tasks)").all();
  console.log('Обновленные колонки:', updatedColumns.map(c => c.name));
  
} catch (error) {
  console.error('❌ Ошибка миграции:', error.message);
}

db.close();