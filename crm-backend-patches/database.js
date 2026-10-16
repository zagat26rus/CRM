const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getCurrentTime() {
  return new Date().toISOString();
}

const dbDir = process.env.CRM_DATA_DIR
  ? path.resolve(process.env.CRM_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'fixnet-crm.sqlite');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function hasTable(tableName) {
  try {
    const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    return !!r;
  } catch {
    return false;
  }
}

function hasColumn(tableName, columnName) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return cols.some((c) => c.name === columnName);
  } catch {
    return false;
  }
}

function addColumnIfMissing(tableName, columnDefSql) {
  const columnName = String(columnDefSql).trim().split(/\s+/)[0];
  if (!columnName) return;
  if (!hasTable(tableName)) return;
  if (hasColumn(tableName, columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefSql}`);
}

function tableSql(tableName) {
  try {
    const r = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    return String(r?.sql || '');
  } catch {
    return '';
  }
}

function migrateLegacySchema() {
  // Add companyId columns where safe
  [
    'orders',
    'payments',
    'tasks',
    'inventory_items',
    'inventory_sales',
    'inventory_receipts',
    'inventory_suppliers',
    'inventory_categories'
  ].forEach((t) => addColumnIfMissing(t, 'companyId INTEGER DEFAULT NULL'));

  // Orders: add extended intake fields
  addColumnIfMissing('orders', 'clientAddress TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'imei TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'serialNumber TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'color TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'equipment TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'devicePassword TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'prepayment REAL DEFAULT 0');
  addColumnIfMissing('orders', 'managerName TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'executorName TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'dueAt TEXT DEFAULT NULL');
  addColumnIfMissing('orders', 'isUrgent BOOLEAN DEFAULT 0');
  addColumnIfMissing('orders', 'estimatedPrice REAL DEFAULT 0');
  addColumnIfMissing('orders', 'receiverNotes TEXT DEFAULT ""');
  // Orders: inspection + wishes JSON
  addColumnIfMissing('orders', 'inspection TEXT DEFAULT "{}"');
  addColumnIfMissing('orders', 'wishes TEXT DEFAULT "{}"');
  addColumnIfMissing('orders', 'documentNumber TEXT DEFAULT ""');
  addColumnIfMissing('orders', 'email TEXT DEFAULT ""');
  addColumnIfMissing('clients', 'vk TEXT DEFAULT ""');
  addColumnIfMissing('payments', 'orderId INTEGER DEFAULT NULL');
  addColumnIfMissing('payments', 'documentId INTEGER DEFAULT NULL');
  addColumnIfMissing('payments', 'saleCategory TEXT DEFAULT NULL');
  addColumnIfMissing('payments', 'method TEXT DEFAULT "card"');
  addColumnIfMissing('inventory_sales', 'customer TEXT DEFAULT ""');
  addColumnIfMissing('inventory_sales', 'shopOrderId INTEGER DEFAULT NULL');
  addColumnIfMissing('orders', 'clientId INTEGER DEFAULT NULL');
  addColumnIfMissing('orders', 'warrantyEndsAt TEXT DEFAULT NULL');
  addColumnIfMissing('orders', 'warrantyDays INTEGER DEFAULT 0');
  addColumnIfMissing('orders', 'partsWrittenOff BOOLEAN DEFAULT 0');
  addColumnIfMissing('companies', 'settingsJson TEXT DEFAULT "{}"');
  addColumnIfMissing('company_documents', 'costTotal REAL DEFAULT 0');

  if (hasTable('payments') && hasColumn('payments', 'saleCategory')) {
    db.prepare(`
      UPDATE payments SET saleCategory = 'repair'
      WHERE (saleCategory IS NULL OR saleCategory = '')
        AND type = 'income' AND orderId IS NOT NULL
    `).run();
    db.prepare(`
      UPDATE payments SET saleCategory = 'tech'
      WHERE (saleCategory IS NULL OR saleCategory = '')
        AND type = 'income' AND description LIKE '%магазина%'
    `).run();
    db.prepare(`
      UPDATE payments SET saleCategory = 'parts'
      WHERE (saleCategory IS NULL OR saleCategory = '')
        AND type = 'income' AND description LIKE '%склада%'
    `).run();
    db.prepare(`
      UPDATE payments SET saleCategory = 'tech'
      WHERE (saleCategory IS NULL OR saleCategory = '')
        AND type = 'income' AND documentId IS NOT NULL
    `).run();
  }

  if (hasTable('payments') && hasColumn('payments', 'orderId')) {
    const legacyPayments = db.prepare(`
      SELECT id, description FROM payments
      WHERE orderId IS NULL AND description LIKE 'Оплата заказа #%'
    `).all();
    const linkStmt = db.prepare('UPDATE payments SET orderId = ? WHERE id = ?');
    for (const row of legacyPayments) {
      const match = String(row.description || '').match(/Оплата заказа #(\d+)/);
      if (match) linkStmt.run(Number(match[1]), row.id);
    }

    db.prepare(`
      DELETE FROM payments
      WHERE orderId IS NOT NULL
        AND orderId NOT IN (SELECT id FROM orders)
    `).run();
  }

  if (hasTable('orders')) {
    db.prepare(`UPDATE orders SET status = 'Закрыт успешно' WHERE status = 'Закрыт'`).run();
    db.prepare(`UPDATE orders SET status = 'Отказ клиента' WHERE status = 'Отказ'`).run();
  }

  if (hasTable('orders') && hasColumn('orders', 'clientId') && hasTable('clients')) {
    db.prepare(`
      UPDATE orders
      SET clientId = (
        SELECT c.id FROM clients c
        WHERE c.companyId = orders.companyId AND c.phone = orders.phone
        LIMIT 1
      )
      WHERE clientId IS NULL AND phone IS NOT NULL AND phone != ''
    `).run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS document_counters (
      companyId INTEGER NOT NULL,
      year INTEGER NOT NULL,
      docType TEXT NOT NULL DEFAULT 'repair_receipt',
      counter INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (companyId, year, docType),
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  if (hasTable('document_counters') && !hasColumn('document_counters', 'docType')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('DROP TABLE IF EXISTS document_counters__new;');
    db.exec(`
      CREATE TABLE document_counters__new (
        companyId INTEGER NOT NULL,
        year INTEGER NOT NULL,
        docType TEXT NOT NULL DEFAULT 'repair_receipt',
        counter INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (companyId, year, docType),
        FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      INSERT INTO document_counters__new (companyId, year, docType, counter)
      SELECT companyId, year, 'repair_receipt', counter FROM document_counters;
    `);
    db.exec('DROP TABLE document_counters;');
    db.exec('ALTER TABLE document_counters__new RENAME TO document_counters;');
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS company_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      docType TEXT NOT NULL,
      documentNumber TEXT NOT NULL DEFAULT '',
      documentDate TEXT DEFAULT '',
      orderId INTEGER DEFAULT NULL,
      client TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      title TEXT DEFAULT '',
      dataJson TEXT NOT NULL DEFAULT '{}',
      total REAL DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_documents_companyId ON company_documents(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_documents_docType ON company_documents(docType);`);

  // Clients: remove UNIQUE(phone) and add companyId-scoped uniqueness
  if (hasTable('clients')) {
    const sql = tableSql('clients');
    const needsRebuild = /UNIQUE\s*\(\s*phone\s*\)/i.test(sql) || !hasColumn('clients', 'companyId');
    if (needsRebuild) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('DROP TABLE IF EXISTS clients__new;');
      db.exec(`
        CREATE TABLE clients__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          companyId INTEGER DEFAULT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          telegram TEXT DEFAULT '',
          whatsapp TEXT DEFAULT '',
          totalOrders INTEGER DEFAULT 0,
          totalSpent REAL DEFAULT 0,
          lastOrderDate TEXT DEFAULT NULL,
          createdAt TEXT,
          updatedAt TEXT,
          FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
        );
      `);

      // Preserve ids + data, companyId stays NULL until first owner registration assigns it
      const hasEmail = hasColumn('clients', 'email');
      const emailExpr = hasEmail ? "COALESCE(email,'')" : "''";
      db.exec(`
        INSERT INTO clients__new (id, companyId, name, phone, email, notes, telegram, whatsapp, totalOrders, totalSpent, lastOrderDate, createdAt, updatedAt)
        SELECT id, NULL as companyId, name, phone, ${emailExpr} as email,
               COALESCE(notes,''), COALESCE(telegram,''), COALESCE(whatsapp,''),
               COALESCE(totalOrders,0), COALESCE(totalSpent,0), lastOrderDate, createdAt, updatedAt
        FROM clients;
      `);

      db.exec('DROP TABLE clients;');
      db.exec('ALTER TABLE clients__new RENAME TO clients;');
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_phone_unique ON clients(companyId, phone) WHERE companyId IS NOT NULL;`
      );
      db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_companyId ON clients(companyId);`);
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Categories: remove UNIQUE(name,type) and add companyId-scoped uniqueness
  if (hasTable('categories')) {
    const sql = tableSql('categories');
    const needsRebuild = /UNIQUE\s*\(\s*name\s*,\s*type\s*\)/i.test(sql) || !hasColumn('categories', 'companyId');
    if (needsRebuild) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('DROP TABLE IF EXISTS categories__new;');
      db.exec(`
        CREATE TABLE categories__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          companyId INTEGER DEFAULT NULL,
          name TEXT NOT NULL,
          type TEXT CHECK(type IN ('income','expense')) NOT NULL,
          description TEXT DEFAULT '',
          color TEXT DEFAULT '#3b82f6',
          icon TEXT DEFAULT '',
          isActive BOOLEAN DEFAULT 1,
          isDefault BOOLEAN DEFAULT 0,
          createdAt TEXT,
          updatedAt TEXT,
          FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
        );
      `);
      db.exec(`
        INSERT INTO categories__new (id, companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
        SELECT id, NULL as companyId, name, type, COALESCE(description,''), COALESCE(color,'#3b82f6'), COALESCE(icon,''),
               COALESCE(isActive,1), COALESCE(isDefault,0), createdAt, updatedAt
        FROM categories;
      `);
      db.exec('DROP TABLE categories;');
      db.exec('ALTER TABLE categories__new RENAME TO categories;');
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_company_unique ON categories(companyId, name, type) WHERE companyId IS NOT NULL;`
      );
      db.exec(`CREATE INDEX IF NOT EXISTS idx_categories_companyId ON categories(companyId);`);
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Brands: make per-company (remove global unique name, add companyId)
  if (hasTable('brands')) {
    const sql = tableSql('brands');
    const hasCompanyId = hasColumn('brands', 'companyId');
    // Check if unique constraint on name exists (legacy)
    const hasLegacyUnique = /UNIQUE/i.test(sql) && !hasCompanyId;
    
    if (!hasCompanyId || hasLegacyUnique) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('DROP TABLE IF EXISTS brands__new;');
      db.exec(`
        CREATE TABLE brands__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          companyId INTEGER DEFAULT NULL,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '',
          createdAt TEXT,
          FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
        );
      `);
      
      // Assign existing brands to NULL (will be assigned to first company later or stay global-legacy)
      db.exec(`
        INSERT INTO brands__new (id, companyId, name, icon, createdAt)
        SELECT id, NULL, name, icon, createdAt FROM brands;
      `);
      
      db.exec('DROP TABLE brands;');
      db.exec('ALTER TABLE brands__new RENAME TO brands;');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_company_name ON brands(companyId, name) WHERE companyId IS NOT NULL;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_brands_companyId ON brands(companyId);');
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Common Problems: make per-company
  if (hasTable('common_problems')) {
    const hasCompanyId = hasColumn('common_problems', 'companyId');
    if (!hasCompanyId) {
      addColumnIfMissing('common_problems', 'companyId INTEGER DEFAULT NULL REFERENCES companies(id) ON DELETE CASCADE');
      db.exec('CREATE INDEX IF NOT EXISTS idx_problems_companyId ON common_problems(companyId);');
    }
  }

  // Assign legacy NULL companyId to the first company if exists
  const firstCompany = db.prepare('SELECT id FROM companies ORDER BY id ASC LIMIT 1').get();
  if (firstCompany) {
    const tables = ['brands', 'common_problems', 'device_models'];
    tables.forEach(t => {
      if (hasTable(t) && hasColumn(t, 'companyId')) {
        db.prepare(`UPDATE ${t} SET companyId = ? WHERE companyId IS NULL`).run(firstCompany.id);
      }
    });
  }
}

// Создание всех таблиц (актуальная схема)
function initDatabase() {
  // Auth / Multi-tenant
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      inn TEXT DEFAULT NULL,
      city TEXT DEFAULT '',
      address TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('owner','admin','director','master')),
      passwordSalt TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_companyId ON users(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      createdAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      email TEXT DEFAULT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','director','master')),
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      createdByUserId INTEGER NOT NULL,
      usedByUserId INTEGER DEFAULT NULL,
      usedAt TEXT DEFAULT NULL,
      createdAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (usedByUserId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invites_companyId ON invites(companyId);`);

  // Payments categories (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('income','expense')) NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#3b82f6',
      icon TEXT DEFAULT '',
      isActive BOOLEAN DEFAULT 1,
      isDefault BOOLEAN DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_company_unique ON categories(companyId, name, type) WHERE companyId IS NOT NULL;`
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_categories_companyId ON categories(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
      categoryId INTEGER DEFAULT NULL,
      description TEXT NOT NULL,
      date TEXT,
      attachments TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      isConfirmed BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_companyId ON payments(companyId);`);

  // Clients (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      telegram TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      vk TEXT DEFAULT '',
      totalOrders INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      lastOrderDate TEXT DEFAULT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_phone_unique ON clients(companyId, phone) WHERE companyId IS NOT NULL;`
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_companyId ON clients(companyId);`);

  // Orders (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      client TEXT NOT NULL,
      phone TEXT NOT NULL,
      clientAddress TEXT DEFAULT '',
      problem TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      color TEXT DEFAULT '',
      deviceType TEXT DEFAULT 'Смартфон',
      imei TEXT DEFAULT '',
      serialNumber TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      devicePassword TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'В работе',
      price REAL DEFAULT 0,
      costPrice REAL DEFAULT 0,
      estimatedPrice REAL DEFAULT 0,
      prepayment REAL DEFAULT 0,
      description TEXT DEFAULT '',
      receiverNotes TEXT DEFAULT '',
      inspection TEXT DEFAULT '{}',
      wishes TEXT DEFAULT '{}',
      managerName TEXT DEFAULT '',
      executorName TEXT DEFAULT '',
      dueAt TEXT DEFAULT NULL,
      isUrgent BOOLEAN DEFAULT 0,
      warranty BOOLEAN DEFAULT 0,
      onSite BOOLEAN DEFAULT 0,
      paymentMethod TEXT DEFAULT 'cash',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_companyId ON orders(companyId);`);

  // Связь заказов и поломок (многие-ко-многим)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_problems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      problemId INTEGER DEFAULT NULL,
      problemName TEXT NOT NULL,
      problemDescription TEXT DEFAULT '',
      price REAL DEFAULT 0 CHECK(price >= 0),
      costPrice REAL DEFAULT 0 CHECK(costPrice >= 0),
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (problemId) REFERENCES common_problems(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_problems_orderId ON order_problems(orderId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_problems_problemId ON order_problems(problemId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      orderId INTEGER NOT NULL,
      itemId INTEGER NOT NULL,
      itemName TEXT NOT NULL,
      sku TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      purchasePrice REAL DEFAULT 0 CHECK(purchasePrice >= 0),
      salePrice REAL DEFAULT 0 CHECK(salePrice >= 0),
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE RESTRICT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_parts_orderId ON order_parts(orderId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_parts_companyId ON order_parts(companyId);`);

  // Order history / timeline (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      orderId INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('status','comment','file','system')),
      message TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      meta TEXT DEFAULT '{}',
      createdByUserId INTEGER DEFAULT NULL,
      createdAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_history_companyId ON order_history(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_history_orderId ON order_history(orderId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_history_createdAt ON order_history(createdAt);`);

  // Tasks (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'general',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'new',
      orderId INTEGER DEFAULT NULL,
      assignedTo TEXT DEFAULT '',
      dueDate TEXT DEFAULT NULL,
      reminderTime TEXT DEFAULT NULL,
      isCompleted BOOLEAN DEFAULT 0,
      completedAt TEXT DEFAULT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_companyId ON tasks(companyId);`);

  // Inventory warehouses (склады)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      address TEXT DEFAULT '',
      isActive BOOLEAN DEFAULT 1,
      isDefault BOOLEAN DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_warehouses_company_name ON inventory_warehouses(companyId, name) WHERE companyId IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_warehouses_companyId ON inventory_warehouses(companyId);`);

  // Inventory suppliers / categories / items / sales / receipts (company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      contactPerson TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_suppliers_companyId ON inventory_suppliers(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_categories_companyId ON inventory_categories(companyId);`);

  // Миграция: добавить колонку warehouseId, если её нет (ДО создания таблицы)
  if (hasTable('inventory_items')) {
    if (!hasColumn('inventory_items', 'warehouseId')) {
      try {
        // SQLite не поддерживает FOREIGN KEY в ALTER TABLE, добавляем только колонку
        db.exec('ALTER TABLE inventory_items ADD COLUMN warehouseId INTEGER DEFAULT NULL;');
        console.log('✅ Колонка warehouseId добавлена в inventory_items');
      } catch (e) {
        console.error('❌ Ошибка добавления колонки warehouseId:', e);
      }
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      warehouseId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      sku TEXT DEFAULT '',
      supplier TEXT DEFAULT '',
      supplierId INTEGER DEFAULT NULL,
      categoryId INTEGER DEFAULT NULL,
      purchasePrice REAL DEFAULT 0 CHECK(purchasePrice >= 0),
      salePrice REAL DEFAULT 0 CHECK(salePrice >= 0),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      unit TEXT DEFAULT 'шт',
      description TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (warehouseId) REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
      FOREIGN KEY (supplierId) REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (categoryId) REFERENCES inventory_categories(id) ON DELETE SET NULL,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_items_companyId ON inventory_items(companyId);`);
  
  // Создать индекс только если колонка существует
  if (hasTable('inventory_items') && hasColumn('inventory_items', 'warehouseId')) {
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_items_warehouseId ON inventory_items(warehouseId);`);
    } catch (e) {
      console.error('Ошибка создания индекса warehouseId:', e);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      itemId INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      pricePerUnit REAL NOT NULL CHECK(pricePerUnit >= 0),
      total REAL NOT NULL CHECK(total >= 0),
      paymentId INTEGER DEFAULT NULL,
      comment TEXT DEFAULT '',
      method TEXT DEFAULT 'cash',
      createdAt TEXT,
      FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
      FOREIGN KEY (paymentId) REFERENCES payments(id) ON DELETE SET NULL,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_sales_companyId ON inventory_sales(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      itemId INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      purchasePricePerUnit REAL NOT NULL CHECK(purchasePricePerUnit >= 0),
      total REAL NOT NULL CHECK(total >= 0),
      paymentId INTEGER DEFAULT NULL,
      supplierId INTEGER DEFAULT NULL,
      comment TEXT DEFAULT '',
      method TEXT DEFAULT 'cash',
      createdAt TEXT,
      FOREIGN KEY (itemId) REFERENCES inventory_items(id) ON DELETE CASCADE,
      FOREIGN KEY (paymentId) REFERENCES payments(id) ON DELETE SET NULL,
      FOREIGN KEY (supplierId) REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_receipts_companyId ON inventory_receipts(companyId);`);

  // Dictionaries (now company-scoped)
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      createdAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  // Создаем индексы только если колонка companyId существует (после миграции)
  // Временно пропускаем, они будут созданы в migrateLegacySchema() если нужно

  db.exec(`
    CREATE TABLE IF NOT EXISTS device_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brandId INTEGER NOT NULL,
      name TEXT NOT NULL,
      deviceType TEXT DEFAULT 'Смартфон',
      createdAt TEXT,
      UNIQUE(brandId, name),
      FOREIGN KEY (brandId) REFERENCES brands(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS common_problems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      defaultCostPrice REAL DEFAULT 0,
      defaultPrice REAL DEFAULT 0,
      deviceType TEXT DEFAULT 'Смартфон',
      createdAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  
  // Интеграции для управления API ключами и webhook'ами
  db.exec(`
    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      serviceCenterId INTEGER DEFAULT NULL,
      apiKey TEXT NOT NULL UNIQUE,
      webhookUrl TEXT DEFAULT '',
      webhookSecret TEXT DEFAULT '',
      isActive BOOLEAN DEFAULT 1,
      lastSyncAt TEXT DEFAULT NULL,
      lastError TEXT DEFAULT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_companyId ON integrations(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_apiKey ON integrations(apiKey);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_integrations_serviceCenterId ON integrations(serviceCenterId);`);

  // Shop (Магазин)
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      imageUrl TEXT DEFAULT '',
      sortOrder INTEGER DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_categories_company_name ON shop_categories(companyId, name) WHERE companyId IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_categories_companyId ON shop_categories(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      categoryId INTEGER DEFAULT NULL,
      inventoryItemId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      price REAL NOT NULL CHECK(price >= 0),
      compareAtPrice REAL DEFAULT NULL CHECK(compareAtPrice >= 0 OR compareAtPrice IS NULL),
      imageUrl TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      stockQuantity INTEGER DEFAULT 0 CHECK(stockQuantity >= 0),
      trackInventory BOOLEAN DEFAULT 1,
      isActive BOOLEAN DEFAULT 1,
      isFeatured BOOLEAN DEFAULT 0,
      sortOrder INTEGER DEFAULT 0,
      seoTitle TEXT DEFAULT '',
      seoDescription TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES shop_categories(id) ON DELETE SET NULL,
      FOREIGN KEY (inventoryItemId) REFERENCES inventory_items(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_products_companyId ON shop_products(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_products_categoryId ON shop_products(categoryId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_products_inventoryItemId ON shop_products(inventoryItemId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_products_isActive ON shop_products(isActive);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      orderNumber TEXT NOT NULL,
      clientName TEXT NOT NULL,
      clientPhone TEXT NOT NULL,
      clientEmail TEXT DEFAULT '',
      clientAddress TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
      paymentStatus TEXT NOT NULL DEFAULT 'pending' CHECK(paymentStatus IN ('pending', 'paid', 'refunded', 'failed')),
      paymentMethod TEXT DEFAULT 'cash',
      deliveryMethod TEXT DEFAULT 'pickup',
      subtotal REAL NOT NULL CHECK(subtotal >= 0),
      deliveryCost REAL DEFAULT 0 CHECK(deliveryCost >= 0),
      total REAL NOT NULL CHECK(total >= 0),
      notes TEXT DEFAULT '',
      items TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_orders_orderNumber ON shop_orders(orderNumber);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_orders_companyId ON shop_orders(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_orders_createdAt ON shop_orders(createdAt);`);

  // Шаблоны квитанций/накладных
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'invoice' CHECK(type IN ('invoice', 'receipt', 'shop_invoice')),
      template TEXT NOT NULL,
      companyName TEXT DEFAULT '',
      companyAddress TEXT DEFAULT '',
      companyPhone TEXT DEFAULT '',
      companyEmail TEXT DEFAULT '',
      companyInn TEXT DEFAULT '',
      companyKpp TEXT DEFAULT '',
      additionalFields TEXT DEFAULT '[]',
      footerText TEXT DEFAULT '',
      displaySettings TEXT DEFAULT '{"showCostPrice":false,"showAdditionalFields":true,"showClientInfo":true,"showDeviceInfo":true,"showDescription":true}',
      isDefault BOOLEAN DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  
  // Миграция: добавить displaySettings, если его нет
  if (hasTable('invoice_templates')) {
    if (!hasColumn('invoice_templates', 'displaySettings')) {
      try {
        db.exec(`ALTER TABLE invoice_templates ADD COLUMN displaySettings TEXT DEFAULT '{"showCostPrice":false,"showAdditionalFields":true,"showClientInfo":true,"showDeviceInfo":true,"showDescription":true}';`);
        console.log('✅ Колонка displaySettings добавлена в invoice_templates');
      } catch (e) {
        console.error('❌ Ошибка добавления колонки displaySettings:', e);
      }
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_templates_companyId ON invoice_templates(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_templates_type ON invoice_templates(type);`);

  // Backward-compatible migrations (for existing DBs)
  migrateLegacySchema();

  // Создаем индексы после миграции, если колонки существуют
  if (hasTable('brands') && hasColumn('brands', 'companyId')) {
    try {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_company_name ON brands(companyId, name) WHERE companyId IS NOT NULL;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_brands_companyId ON brands(companyId);');
    } catch (e) {
      // Игнорируем ошибки создания индексов
    }
  }
  if (hasTable('common_problems') && hasColumn('common_problems', 'companyId')) {
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_problems_companyId ON common_problems(companyId);');
    } catch (e) {
      // Игнорируем ошибки создания индексов
    }
  }

  // Services (Услуги)
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      sortOrder INTEGER DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_company_name ON service_categories(companyId, name) WHERE companyId IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_service_categories_companyId ON service_categories(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      categoryId INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL CHECK(price >= 0),
      duration INTEGER DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES service_categories(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_services_companyId ON services(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_services_categoryId ON services(categoryId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      deviceModelId INTEGER NOT NULL,
      sitePriceId INTEGER,
      issueCode TEXT NOT NULL,
      issueName TEXT NOT NULL,
      subtypeId INTEGER,
      subtypeName TEXT,
      cityCode TEXT NOT NULL DEFAULT '',
      cityName TEXT NOT NULL DEFAULT '',
      partType TEXT NOT NULL DEFAULT 'original',
      priceMin REAL NOT NULL DEFAULT 0,
      priceMax REAL,
      durationMinutes INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT,
      UNIQUE(companyId, deviceModelId, issueCode, subtypeId, cityCode, partType),
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (deviceModelId) REFERENCES device_models(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catalog_prices_company ON catalog_prices(companyId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catalog_prices_model ON catalog_prices(deviceModelId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catalog_prices_lookup ON catalog_prices(companyId, deviceModelId, issueCode);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyOneId INTEGER NOT NULL,
      companyTwoId INTEGER NOT NULL,
      lastMessageAt TEXT,
      createdAt TEXT,
      UNIQUE(companyOneId, companyTwoId),
      FOREIGN KEY (companyOneId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (companyTwoId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_threads_companyOne ON chat_threads(companyOneId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_threads_companyTwo ON chat_threads(companyTwoId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_threads_lastMessageAt ON chat_threads(lastMessageAt);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threadId INTEGER NOT NULL,
      senderUserId INTEGER NOT NULL,
      senderCompanyId INTEGER NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT,
      FOREIGN KEY (threadId) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (senderUserId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (senderCompanyId) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_threadId ON chat_messages(threadId);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_createdAt ON chat_messages(createdAt);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_reads (
      threadId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      lastReadMessageId INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT,
      PRIMARY KEY (threadId, userId),
      FOREIGN KEY (threadId) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      targetRoles TEXT DEFAULT 'all',
      pinned INTEGER DEFAULT 0,
      expiresAt TEXT DEFAULT NULL,
      isActive INTEGER DEFAULT 1,
      createdByUserId INTEGER DEFAULT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcements_companyId ON announcements(companyId);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      announcementId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      readAt TEXT,
      PRIMARY KEY (announcementId, userId),
      FOREIGN KEY (announcementId) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      name TEXT NOT NULL,
      channel TEXT DEFAULT 'whatsapp',
      segment TEXT DEFAULT 'all',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent')),
      recipientCount INTEGER DEFAULT 0,
      sentAt TEXT DEFAULT NULL,
      createdByUserId INTEGER DEFAULT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_companyId ON marketing_campaigns(companyId);`);

  return db;
}

module.exports = {
  db: initDatabase(),
  getCurrentTime
};
