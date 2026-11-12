const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { requireManagement } = require('../middlewares/rbac');

router.use(requireAuth);

router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return requireManagement(req, res, next);
  }
  next();
});

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function ensureInventorySalesCategoryId(companyId) {
  const existing = db
    .prepare("SELECT id FROM categories WHERE companyId = ? AND name = ? AND type = 'income'")
    .get(companyId, 'Продажа со склада');

  if (existing?.id) return existing.id;

  const now = getCurrentTime();
  const result = db
    .prepare(`
      INSERT INTO categories (companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
      VALUES (?, ?, 'income', ?, ?, ?, 1, 0, ?, ?)
    `)
    .run(companyId, 'Продажа со склада', 'Продажа товаров со склада', '#10b981', '', now, now);

  return result.lastInsertRowid;
}

function ensureInventoryPurchaseCategoryId(companyId) {
  const existing = db
    .prepare("SELECT id FROM categories WHERE companyId = ? AND name = ? AND type = 'expense'")
    .get(companyId, 'Закупка на склад');

  if (existing?.id) return existing.id;

  const now = getCurrentTime();
  const result = db
    .prepare(`
      INSERT INTO categories (companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
      VALUES (?, ?, 'expense', ?, ?, ?, 1, 0, ?, ?)
    `)
    .run(companyId, 'Закупка на склад', 'Закупка товаров для склада', '#ef4444', '', now, now);

  return result.lastInsertRowid;
}

function normalizeSupplierRow(r) {
  if (!r) return null;
  return {
    ...r,
    isActive: Boolean(r.isActive)
  };
}

function normalizeCategoryRow(r) {
  if (!r) return null;
  return {
    ...r,
    isActive: Boolean(r.isActive)
  };
}

function normalizeCategoryName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function categoryNamesMatch(a, b) {
  return normalizeCategoryName(a).toLowerCase() === normalizeCategoryName(b).toLowerCase();
}

function countCategoryItems(companyId, categoryId) {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE companyId = ? AND categoryId = ?')
    .get(companyId, categoryId);
  return Number(row?.c || 0);
}

function findActiveCategoriesByName(companyId, name, excludeId = null) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM inventory_categories
      WHERE companyId = ? AND isActive = 1
      ORDER BY id ASC
    `
    )
    .all(companyId);
  return rows.filter(
    (r) => categoryNamesMatch(r.name, name) && (!excludeId || Number(r.id) !== Number(excludeId))
  );
}

function enrichCategory(r, companyId) {
  const base = normalizeCategoryRow(r);
  if (!base) return null;
  return {
    ...base,
    itemCount: countCategoryItems(companyId, base.id),
  };
}

/** Переносит позиции с mergeIds в keepId и soft-delete дубликаты. */
function mergeInventoryCategories(companyId, keepId, mergeIds, preferredName = null) {
  const keep = db
    .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
    .get(keepId, companyId);
  if (!keep) {
    const err = new Error('Целевая категория не найдена');
    err.status = 404;
    throw err;
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(mergeIds) ? mergeIds : [])
        .map((x) => toInt(x, 0))
        .filter((id) => id && id !== keepId)
    )
  );

  const now = getCurrentTime();
  const moveItems = db.prepare(
    `UPDATE inventory_items
     SET categoryId = ?, updatedAt = ?
     WHERE companyId = ? AND categoryId = ?`
  );
  const softDelete = db.prepare(
    `UPDATE inventory_categories
     SET isActive = 0, updatedAt = ?
     WHERE id = ? AND companyId = ?`
  );

  let movedItems = 0;
  const tx = db.transaction(() => {
    for (const mid of ids) {
      const src = db
        .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
        .get(mid, companyId);
      if (!src) continue;
      const before = countCategoryItems(companyId, mid);
      moveItems.run(keepId, now, companyId, mid);
      movedItems += before;
      softDelete.run(now, mid, companyId);
    }

    const nextName = preferredName ? normalizeCategoryName(preferredName) : null;
    if (nextName && nextName !== keep.name) {
      db.prepare(
        `UPDATE inventory_categories
         SET name = ?, updatedAt = ?
         WHERE id = ? AND companyId = ?`
      ).run(nextName, now, keepId, companyId);
    } else {
      db.prepare(
        `UPDATE inventory_categories SET updatedAt = ? WHERE id = ? AND companyId = ?`
      ).run(now, keepId, companyId);
    }
  });
  tx();

  const cat = db
    .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
    .get(keepId, companyId);
  return {
    category: enrichCategory(cat, companyId),
    mergedIds: ids,
    movedItems,
  };
}

function normalizeWarehouseRow(r) {
  if (!r) return null;
  return {
    ...r,
    isActive: Boolean(r.isActive),
    isDefault: Boolean(r.isDefault)
  };
}

// ========== СКЛАДЫ ==========

// Список складов
router.get('/warehouses', (req, res) => {
  try {
    const warehouses = db
      .prepare(
        `
        SELECT *
        FROM inventory_warehouses
        WHERE companyId = ?
        ORDER BY isDefault DESC, name ASC, id DESC
      `
      )
      .all(req.user.companyId);
    res.json(warehouses.map(normalizeWarehouseRow));
  } catch (error) {
    console.error('Ошибка получения складов:', error);
    res.status(500).json({ error: 'Ошибка получения складов' });
  }
});

// Создать склад
router.post('/warehouses', (req, res) => {
  try {
    const { name, description = '', address = '', isDefault = false } = req.body || {};
    const n = String(name || '').trim();
    if (!n) return res.status(400).json({ error: 'Название склада обязательно' });

    const now = getCurrentTime();
    
    // Если это склад по умолчанию, сбросить isDefault у других складов
    if (isDefault) {
      db.prepare('UPDATE inventory_warehouses SET isDefault = 0 WHERE companyId = ?').run(req.user.companyId);
    }

    const stmt = db.prepare(`
      INSERT INTO inventory_warehouses (companyId, name, description, address, isActive, isDefault, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        req.user.companyId,
        n,
        String(description || ''),
        String(address || ''),
        isDefault ? 1 : 0,
        now,
        now
      );
      const warehouse = db
        .prepare('SELECT * FROM inventory_warehouses WHERE id = ? AND companyId = ?')
        .get(result.lastInsertRowid, req.user.companyId);
      return res.status(201).json(normalizeWarehouseRow(warehouse));
    } catch (e) {
      // If warehouse already exists, return it.
      const existing = db.prepare('SELECT * FROM inventory_warehouses WHERE companyId = ? AND name = ?').get(req.user.companyId, n);
      if (existing) return res.status(200).json(normalizeWarehouseRow(existing));
      throw e;
    }
  } catch (error) {
    console.error('Ошибка создания склада:', error);
    res.status(500).json({ error: 'Ошибка создания склада' });
  }
});

// Обновить склад
router.put('/warehouses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, address, isActive, isDefault } = req.body;
    const warehouse = db.prepare('SELECT * FROM inventory_warehouses WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!warehouse) return res.status(404).json({ error: 'Склад не найден' });

    const now = getCurrentTime();
    
    // Если это склад по умолчанию, сбросить isDefault у других складов
    if (isDefault && !warehouse.isDefault) {
      db.prepare('UPDATE inventory_warehouses SET isDefault = 0 WHERE companyId = ?').run(req.user.companyId);
    }

    db.prepare(`
      UPDATE inventory_warehouses
      SET name = ?, description = ?, address = ?, isActive = ?, isDefault = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name !== undefined ? String(name).trim() : warehouse.name,
      description !== undefined ? String(description) : warehouse.description,
      address !== undefined ? String(address) : warehouse.address,
      isActive !== undefined ? (isActive ? 1 : 0) : warehouse.isActive,
      isDefault !== undefined ? (isDefault ? 1 : 0) : warehouse.isDefault,
      now,
      id,
      req.user.companyId
    );

    const updated = db.prepare('SELECT * FROM inventory_warehouses WHERE id = ?').get(id);
    res.json(normalizeWarehouseRow(updated));
  } catch (error) {
    console.error('Ошибка обновления склада:', error);
    res.status(500).json({ error: 'Ошибка обновления склада' });
  }
});

// Удалить склад
router.delete('/warehouses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const warehouse = db.prepare('SELECT * FROM inventory_warehouses WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!warehouse) return res.status(404).json({ error: 'Склад не найден' });
    
    const itemsCount = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE warehouseId = ?').get(id).count;
    if (itemsCount > 0) {
      return res.status(400).json({ error: 'Нельзя удалить склад, в котором есть товары' });
    }

    db.prepare('DELETE FROM inventory_warehouses WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления склада:', error);
    res.status(500).json({ error: 'Ошибка удаления склада' });
  }
});

// Справочник поставщиков
router.get('/suppliers', (req, res) => {
  try {
    const suppliers = db
      .prepare(
        `
        SELECT *
        FROM inventory_suppliers
        WHERE companyId = ? AND isActive = 1
        ORDER BY name ASC, id DESC
      `
      )
      .all(req.user.companyId);
    res.json(suppliers.map(normalizeSupplierRow));
  } catch (error) {
    console.error('Ошибка получения поставщиков:', error);
    res.status(500).json({ error: 'Ошибка получения поставщиков' });
  }
});

router.post('/suppliers', (req, res) => {
  try {
    const { name, phone = '', contactPerson = '', notes = '' } = req.body || {};
    const n = String(name || '').trim();
    if (!n) return res.status(400).json({ error: 'Название поставщика обязательно' });

    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO inventory_suppliers (companyId, name, phone, contactPerson, notes, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    try {
      const result = stmt.run(req.user.companyId, n, String(phone || ''), String(contactPerson || ''), String(notes || ''), now, now);
      const supplier = db
        .prepare('SELECT * FROM inventory_suppliers WHERE id = ? AND companyId = ?')
        .get(result.lastInsertRowid, req.user.companyId);
      return res.status(201).json(normalizeSupplierRow(supplier));
    } catch (e) {
      // If supplier already exists, return it.
      const existing = db.prepare('SELECT * FROM inventory_suppliers WHERE companyId = ? AND name = ?').get(req.user.companyId, n);
      if (existing) return res.status(200).json(normalizeSupplierRow(existing));
      throw e;
    }
  } catch (error) {
    console.error('Ошибка создания поставщика:', error);
    res.status(500).json({ error: 'Ошибка создания поставщика' });
  }
});

// Справочник номенклатуры (категории склада)
router.get('/categories', (req, res) => {
  try {
    const categories = db
      .prepare(
        `
        SELECT *
        FROM inventory_categories
        WHERE companyId = ? AND isActive = 1
        ORDER BY name ASC, id DESC
      `
      )
      .all(req.user.companyId);
    res.json(categories.map((c) => enrichCategory(c, req.user.companyId)));
  } catch (error) {
    console.error('Ошибка получения категорий склада:', error);
    res.status(500).json({ error: 'Ошибка получения категорий склада' });
  }
});

router.post('/categories/merge', (req, res) => {
  try {
    const keepId = toInt(req.body?.keepId, 0);
    const mergeIds = Array.isArray(req.body?.mergeIds) ? req.body.mergeIds : [];
    const preferredName = req.body?.name != null ? String(req.body.name) : null;
    if (!keepId) return res.status(400).json({ error: 'Не указана целевая категория' });
    if (!mergeIds.length) {
      return res.status(400).json({ error: 'Не указаны категории для объединения' });
    }

    const result = mergeInventoryCategories(req.user.companyId, keepId, mergeIds, preferredName);
    res.json({
      ok: true,
      ...result,
      message: `Объединено: перенесено позиций ${result.movedItems}, удалено дубликатов ${result.mergedIds.length}`,
    });
  } catch (error) {
    console.error('Ошибка объединения категорий склада:', error);
    res.status(error.status || 500).json({ error: error.message || 'Ошибка объединения категорий' });
  }
});

router.post('/categories', (req, res) => {
  try {
    const { name, description = '', merge = false } = req.body || {};
    const n = normalizeCategoryName(name);
    if (!n) return res.status(400).json({ error: 'Название категории обязательно' });

    const duplicates = findActiveCategoriesByName(req.user.companyId, n).map((c) =>
      enrichCategory(c, req.user.companyId)
    );

    if (duplicates.length > 0) {
      // keep = категория с наибольшим числом позиций (при равенстве — самая ранняя)
      const keep = [...duplicates].sort((a, b) => {
        if ((b.itemCount || 0) !== (a.itemCount || 0)) return (b.itemCount || 0) - (a.itemCount || 0);
        return a.id - b.id;
      })[0];
      const others = duplicates.filter((d) => d.id !== keep.id);

      if (merge) {
        if (others.length > 0) {
          const result = mergeInventoryCategories(
            req.user.companyId,
            keep.id,
            others.map((d) => d.id),
            n
          );
          return res.status(200).json({
            ...result.category,
            merged: true,
            movedItems: result.movedItems,
            mergedIds: result.mergedIds,
          });
        }
        // Одна существующая — просто используем её (подправим имя при необходимости)
        if (normalizeCategoryName(keep.name) !== n) {
          const now = getCurrentTime();
          db.prepare(
            `UPDATE inventory_categories SET name = ?, updatedAt = ? WHERE id = ? AND companyId = ?`
          ).run(n, now, keep.id, req.user.companyId);
        }
        const cat = db
          .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
          .get(keep.id, req.user.companyId);
        return res.status(200).json({ ...enrichCategory(cat, req.user.companyId), merged: false });
      }

      const totalItems = duplicates.reduce((acc, d) => acc + (d.itemCount || 0), 0);
      return res.status(409).json({
        code: 'CATEGORY_EXISTS',
        error: 'Категория с таким названием уже есть',
        name: n,
        existing: keep,
        duplicates,
        totalItems,
        canMerge: true,
        message:
          duplicates.length > 1
            ? `Найдено ${duplicates.length} категории с названием «${n}» (${totalItems} поз.). Объединить в одну?`
            : `Категория «${keep.name}» уже есть (${keep.itemCount || 0} поз.). Использовать её?`,
      });
    }

    const now = getCurrentTime();
    const result = db
      .prepare(
        `
      INSERT INTO inventory_categories (companyId, name, description, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?)
    `
      )
      .run(req.user.companyId, n, String(description || ''), now, now);
    const cat = db
      .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
      .get(result.lastInsertRowid, req.user.companyId);
    return res.status(201).json(enrichCategory(cat, req.user.companyId));
  } catch (error) {
    console.error('Ошибка создания категории склада:', error);
    res.status(500).json({ error: 'Ошибка создания категории склада' });
  }
});

router.put('/categories/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const existing = db
      .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    if (!existing || !existing.isActive) return res.status(404).json({ error: 'Категория не найдена' });

    const name = normalizeCategoryName(req.body?.name ?? existing.name);
    if (!name) return res.status(400).json({ error: 'Название категории обязательно' });
    const description =
      req.body?.description !== undefined
        ? String(req.body.description || '')
        : String(existing.description || '');
    const merge = Boolean(req.body?.merge);

    const duplicates = findActiveCategoriesByName(req.user.companyId, name, id).map((c) =>
      enrichCategory(c, req.user.companyId)
    );

    if (duplicates.length > 0) {
      const source = enrichCategory(existing, req.user.companyId);
      const keep = [...duplicates].sort((a, b) => {
        if ((b.itemCount || 0) !== (a.itemCount || 0)) return (b.itemCount || 0) - (a.itemCount || 0);
        return a.id - b.id;
      })[0];

      if (merge) {
        // Текущую и все дубликаты (кроме keep) сливаем в keep
        const mergeIds = [id, ...duplicates.map((d) => d.id)].filter((x) => x !== keep.id);
        const result = mergeInventoryCategories(req.user.companyId, keep.id, mergeIds, name);
        return res.json({
          ...result.category,
          merged: true,
          movedItems: result.movedItems,
          mergedIds: result.mergedIds,
        });
      }

      const totalItems =
        (source.itemCount || 0) + duplicates.reduce((acc, d) => acc + (d.itemCount || 0), 0);
      return res.status(409).json({
        code: 'CATEGORY_EXISTS',
        error: 'Категория с таким названием уже есть',
        name,
        source,
        existing: keep,
        duplicates,
        totalItems,
        canMerge: true,
        message: `Категория «${keep.name}» уже есть. Объединить «${source.name}» (${source.itemCount || 0} поз.) с ней? Все позиции перейдут в одну категорию.`,
      });
    }

    const now = getCurrentTime();
    db.prepare(
      `UPDATE inventory_categories
       SET name = ?, description = ?, updatedAt = ?
       WHERE id = ? AND companyId = ?`
    ).run(name, description, now, id, req.user.companyId);

    const cat = db
      .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    res.json(enrichCategory(cat, req.user.companyId));
  } catch (error) {
    console.error('Ошибка обновления категории склада:', error);
    res.status(error.status || 500).json({ error: error.message || 'Ошибка обновления категории склада' });
  }
});

router.delete('/categories/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const existing = db
      .prepare('SELECT * FROM inventory_categories WHERE id = ? AND companyId = ?')
      .get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Категория не найдена' });

    const used = countCategoryItems(req.user.companyId, id);
    if (used > 0) {
      return res.status(400).json({
        error: `Нельзя удалить: категория используется в ${used} товар(ах). Сначала смените категорию у товаров или объедините категории.`,
      });
    }

    const now = getCurrentTime();
    // Soft-delete so history/refs stay intact
    db.prepare(
      `UPDATE inventory_categories SET isActive = 0, updatedAt = ? WHERE id = ? AND companyId = ?`
    ).run(now, id, req.user.companyId);

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления категории склада:', error);
    res.status(500).json({ error: 'Ошибка удаления категории склада' });
  }
});

// Список товаров
router.get('/items', (req, res) => {
  try {
    const { search = '' } = req.query;
    const q = String(search || '').trim();

    const items = q
      ? db
          .prepare(
            `
            SELECT
              i.*,
              s.name as supplierName,
              c.name as categoryName,
              w.name as warehouseName
            FROM inventory_items i
            LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
            LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
            LEFT JOIN inventory_warehouses w ON w.id = i.warehouseId AND w.companyId = i.companyId
            WHERE
              i.companyId = ? AND (
                i.name LIKE ? OR i.sku LIKE ? OR i.supplier LIKE ? OR
                s.name LIKE ? OR c.name LIKE ? OR w.name LIKE ?
              )
            ORDER BY i.name ASC, i.id DESC
          `
          )
          .all(req.user.companyId, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
      : db
          .prepare(
            `
            SELECT
              i.*,
              s.name as supplierName,
              c.name as categoryName,
              w.name as warehouseName
            FROM inventory_items i
            LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
            LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
            LEFT JOIN inventory_warehouses w ON w.id = i.warehouseId AND w.companyId = i.companyId
            WHERE i.companyId = ?
            ORDER BY i.name ASC, i.id DESC
          `
          )
          .all(req.user.companyId);

    res.json(
      items.map((i) => ({
        ...i,
        purchasePrice: toNumber(i.purchasePrice, 0),
        salePrice: toNumber(i.salePrice, 0),
        quantity: toInt(i.quantity, 0),
        supplierId: i.supplierId !== null && i.supplierId !== undefined ? toInt(i.supplierId, 0) : null,
        categoryId: i.categoryId !== null && i.categoryId !== undefined ? toInt(i.categoryId, 0) : null,
        warehouseId: i.warehouseId !== null && i.warehouseId !== undefined ? toInt(i.warehouseId, 0) : null
      }))
    );
  } catch (error) {
    console.error('Ошибка получения товаров склада:', error);
    res.status(500).json({ error: 'Ошибка получения товаров склада' });
  }
});

// Создать товар
router.post('/items', (req, res) => {
  try {
    const {
      name,
      sku = '',
      supplier = '', // legacy free-text
      supplierId = null,
      categoryId = null,
      warehouseId = null,
      purchasePrice = 0,
      salePrice = 0,
      quantity = 0,
      unit = 'шт',
      description = ''
    } = req.body || {};

    const trimmedName = String(name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Название товара обязательно' });

    const qty = toInt(quantity, 0);
    if (qty < 0) return res.status(400).json({ error: 'Количество не может быть отрицательным' });

    const pp = toNumber(purchasePrice, 0);
    const sp = toNumber(salePrice, 0);
    if (pp < 0 || sp < 0) return res.status(400).json({ error: 'Цены не могут быть отрицательными' });

    const now = getCurrentTime();
    const result = db
      .prepare(
        `
        INSERT INTO inventory_items
          (companyId, warehouseId, name, sku, supplier, supplierId, categoryId, purchasePrice, salePrice, quantity, unit, description, createdAt, updatedAt)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        req.user.companyId,
        warehouseId !== null && warehouseId !== undefined ? toInt(warehouseId, 0) || null : null,
        trimmedName,
        String(sku || ''),
        String(supplier || ''),
        supplierId !== null && supplierId !== undefined ? toInt(supplierId, 0) || null : null,
        categoryId !== null && categoryId !== undefined ? toInt(categoryId, 0) || null : null,
        pp,
        sp,
        qty,
        String(unit || 'шт'),
        String(description || ''),
        now,
        now
      );

    const item = db
      .prepare(
        `
        SELECT
          i.*,
          s.name as supplierName,
          c.name as categoryName,
          w.name as warehouseName
        FROM inventory_items i
        LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
        LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
        LEFT JOIN inventory_warehouses w ON w.id = i.warehouseId AND w.companyId = i.companyId
        WHERE i.id = ? AND i.companyId = ?
      `
      )
      .get(result.lastInsertRowid, req.user.companyId);
    res.status(201).json(item);
  } catch (error) {
    console.error('Ошибка создания товара склада:', error);
    res.status(500).json({ error: 'Ошибка создания товара склада' });
  }
});

// Обновить товар
router.put('/items/:id', (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });

    const patch = req.body || {};
    const name = patch.name !== undefined ? String(patch.name || '').trim() : existing.name;
    if (!name) return res.status(400).json({ error: 'Название товара обязательно' });

    const sku = patch.sku !== undefined ? String(patch.sku || '') : existing.sku;
    const supplier = patch.supplier !== undefined ? String(patch.supplier || '') : existing.supplier;
    const unit = patch.unit !== undefined ? String(patch.unit || 'шт') : existing.unit;
    const description = patch.description !== undefined ? String(patch.description || '') : existing.description;
    const supplierId =
      patch.supplierId !== undefined
        ? patch.supplierId !== null && patch.supplierId !== undefined
          ? toInt(patch.supplierId, 0) || null
          : null
        : existing.supplierId;
    const categoryId =
      patch.categoryId !== undefined
        ? patch.categoryId !== null && patch.categoryId !== undefined
          ? toInt(patch.categoryId, 0) || null
          : null
        : existing.categoryId;
    const warehouseId =
      patch.warehouseId !== undefined
        ? patch.warehouseId !== null && patch.warehouseId !== undefined
          ? toInt(patch.warehouseId, 0) || null
          : null
        : existing.warehouseId;

    const purchasePrice =
      patch.purchasePrice !== undefined ? toNumber(patch.purchasePrice, existing.purchasePrice) : existing.purchasePrice;
    const salePrice = patch.salePrice !== undefined ? toNumber(patch.salePrice, existing.salePrice) : existing.salePrice;
    const quantity = patch.quantity !== undefined ? toInt(patch.quantity, existing.quantity) : existing.quantity;

    if (purchasePrice < 0 || salePrice < 0) return res.status(400).json({ error: 'Цены не могут быть отрицательными' });
    if (quantity < 0) return res.status(400).json({ error: 'Количество не может быть отрицательным' });

    const now = getCurrentTime();
    db.prepare(
      `
      UPDATE inventory_items
      SET name = ?, sku = ?, supplier = ?, supplierId = ?, categoryId = ?, warehouseId = ?, purchasePrice = ?, salePrice = ?, quantity = ?, unit = ?, description = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `
    ).run(name, sku, supplier, supplierId, categoryId, warehouseId, purchasePrice, salePrice, quantity, unit, description, now, id, req.user.companyId);

    const item = db
      .prepare(
        `
        SELECT
          i.*,
          s.name as supplierName,
          c.name as categoryName,
          w.name as warehouseName
        FROM inventory_items i
        LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
        LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
        LEFT JOIN inventory_warehouses w ON w.id = i.warehouseId AND w.companyId = i.companyId
        WHERE i.id = ? AND i.companyId = ?
      `
      )
      .get(id, req.user.companyId);
    res.json(item);
  } catch (error) {
    console.error('Ошибка обновления товара склада:', error);
    res.status(500).json({ error: 'Ошибка обновления товара склада' });
  }
});

// Приход товара (увеличиваем остаток и создаём платеж-расход)
router.post('/receipts', (req, res) => {
  try {
    const { itemId, quantity, purchasePricePerUnit, supplierId = null, comment = '', method = 'card' } = req.body || {};

    const id = toInt(itemId, 0);
    const qty = toInt(quantity, 0);
    if (!id) return res.status(400).json({ error: 'itemId обязателен' });
    if (qty <= 0) return res.status(400).json({ error: 'quantity должен быть > 0' });

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!item) return res.status(404).json({ error: 'Товар не найден' });

    const ppu = purchasePricePerUnit !== undefined ? toNumber(purchasePricePerUnit, 0) : toNumber(item.purchasePrice, 0);
    if (ppu < 0) return res.status(400).json({ error: 'purchasePricePerUnit не может быть отрицательным' });

    const total = Math.round(ppu * qty * 100) / 100;
    const now = getCurrentTime();

    const tx = db.transaction(() => {
      // 1) Увеличиваем остаток
      db.prepare('UPDATE inventory_items SET quantity = quantity + ?, updatedAt = ? WHERE id = ? AND companyId = ?').run(
        qty,
        now,
        id,
        req.user.companyId
      );

      // 2) Платёж (расход)
      const categoryId = ensureInventoryPurchaseCategoryId(req.user.companyId);
      const description =
        String(comment || '').trim() ||
        `Закупка на склад: ${item.name}${qty ? ` × ${qty}` : ''}${ppu ? ` по ${ppu}₽` : ''}`;

      const paymentResult = db
        .prepare(
          `
          INSERT INTO payments (companyId, amount, type, categoryId, description, date, createdAt, updatedAt)
          VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
        `
        )
        .run(req.user.companyId, total, categoryId, description, now, now, now);

      // 3) Запись прихода
      const receiptResult = db
        .prepare(
          `
          INSERT INTO inventory_receipts
            (companyId, itemId, quantity, purchasePricePerUnit, total, paymentId, supplierId, comment, method, createdAt)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          req.user.companyId,
          id,
          qty,
          ppu,
          total,
          paymentResult.lastInsertRowid,
          supplierId !== null && supplierId !== undefined ? toInt(supplierId, 0) || null : null,
          String(comment || ''),
          String(method || 'card'),
          now
        );

      return {
        receiptId: receiptResult.lastInsertRowid,
        paymentId: paymentResult.lastInsertRowid
      };
    });

    const result = tx();
    const updatedItem = db
      .prepare(
        `
        SELECT
          i.*,
          s.name as supplierName,
          c.name as categoryName
        FROM inventory_items i
        LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
        LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
        WHERE i.id = ? AND i.companyId = ?
      `
      )
      .get(id, req.user.companyId);

    res.status(201).json({
      ...result,
      item: updatedItem
    });
  } catch (error) {
    console.error('Ошибка прихода товара на склад:', error);
    res.status(500).json({ error: 'Ошибка прихода товара на склад' });
  }
});

// История приходов (опционально для UI)
router.get('/receipts', (req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT r.*, i.name as itemName, i.sku as itemSku, s.name as supplierName
        FROM inventory_receipts r
        LEFT JOIN inventory_items i ON i.id = r.itemId AND i.companyId = r.companyId
        LEFT JOIN inventory_suppliers s ON s.id = r.supplierId AND s.companyId = r.companyId
        WHERE r.companyId = ?
        ORDER BY r.createdAt DESC, r.id DESC
        LIMIT 200
      `
      )
      .all(req.user.companyId);

    res.json(rows);
  } catch (error) {
    console.error('Ошибка получения приходов склада:', error);
    res.status(500).json({ error: 'Ошибка получения приходов склада' });
  }
});

// Продать товар (уменьшаем остаток и создаём платеж)
router.post('/sales', (req, res) => {
  try {
    // совместимость со старыми БД без колонки customer
    try {
      const cols = db.prepare(`PRAGMA table_info(inventory_sales)`).all().map((c) => c.name);
      if (!cols.includes('customer')) {
        db.exec(`ALTER TABLE inventory_sales ADD COLUMN customer TEXT DEFAULT ''`);
      }
      if (!cols.includes('shopOrderId')) {
        db.exec(`ALTER TABLE inventory_sales ADD COLUMN shopOrderId INTEGER DEFAULT NULL`);
      }
    } catch (e) {
      console.error('inventory_sales migrate:', e);
    }

    const { itemId, quantity, pricePerUnit, costTotal, saleCategory, customer = '', customerPhone = '', comment = '', method = 'card' } = req.body || {};

    const id = toInt(itemId, 0);
    const qty = toInt(quantity, 0);
    if (!id) return res.status(400).json({ error: 'itemId обязателен' });
    if (qty <= 0) return res.status(400).json({ error: 'quantity должен быть > 0' });

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!item) return res.status(404).json({ error: 'Товар не найден' });
    if (toInt(item.quantity, 0) < qty) return res.status(400).json({ error: 'Недостаточно товара на складе' });

    const ppu = pricePerUnit !== undefined && pricePerUnit !== null && String(pricePerUnit).trim() !== ''
      ? toNumber(pricePerUnit, 0)
      : toNumber(item.salePrice, 0);
    if (ppu < 0) return res.status(400).json({ error: 'pricePerUnit не может быть отрицательным' });

    const total = Math.round(ppu * qty * 100) / 100;
    const cost = costTotal !== undefined && costTotal !== null && String(costTotal).trim() !== ''
      ? Math.max(0, toNumber(costTotal, 0))
      : Math.round(toNumber(item.purchasePrice, 0) * qty * 100) / 100;
    const { isSaleCategory } = require('../constants/saleCategories');
    const resolvedSaleCategory = isSaleCategory(saleCategory) ? saleCategory : 'parts';
    const now = getCurrentTime();
    const payMethod = String(method || 'card');

    const tx = db.transaction(() => {
      db.prepare('UPDATE inventory_items SET quantity = quantity - ?, updatedAt = ? WHERE id = ? AND companyId = ?').run(
        qty,
        now,
        id,
        req.user.companyId
      );

      const categoryId = ensureInventorySalesCategoryId(req.user.companyId);
      const description =
        String(comment || '').trim() ||
        `Продажа со склада: ${item.name}${qty ? ` × ${qty}` : ''}${ppu ? ` по ${ppu}₽` : ''}`;

      const paymentResult = db
        .prepare(
          `
          INSERT INTO payments (companyId, amount, type, categoryId, description, date, saleCategory, method, createdAt, updatedAt)
          VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(req.user.companyId, total, categoryId, description, now, resolvedSaleCategory, payMethod, now, now);

      if (cost > 0) {
        db.prepare(`
          INSERT INTO payments (companyId, amount, type, description, date, method, createdAt, updatedAt)
          VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
        `).run(
          req.user.companyId,
          cost,
          `Себестоимость: ${description}`,
          now,
          payMethod,
          now,
          now
        );
      }

      let shopOrderId = null;
      let orderNumber = '';
      try {
        const orderCount = db.prepare('SELECT COUNT(*) as count FROM shop_orders WHERE companyId = ?').get(req.user.companyId).count || 0;
        orderNumber = `SALE-${String(orderCount + 1).padStart(6, '0')}`;
        const customerName = String(customer || '').trim() || 'Розничный покупатель';
        const orderItems = [{
          productId: 0,
          inventoryItemId: id,
          name: item.name,
          sku: item.sku || '',
          quantity: qty,
          price: ppu,
          purchasePrice: toNumber(item.purchasePrice, 0),
        }];
        const orderResult = db.prepare(`
          INSERT INTO shop_orders (
            companyId, orderNumber, clientName, clientPhone, clientEmail, clientAddress,
            status, paymentStatus, paymentMethod, deliveryMethod,
            subtotal, deliveryCost, total, notes, items, createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, 'delivered', 'paid', ?, 'pickup', ?, 0, ?, ?, ?, ?, ?)
        `).run(
          req.user.companyId,
          orderNumber,
          customerName,
          String(customerPhone || '').trim(),
          '',
          '',
          payMethod,
          total,
          total,
          String(comment || '').trim() || `Продажа склада: ${item.name}`,
          JSON.stringify(orderItems),
          now,
          now
        );
        shopOrderId = orderResult.lastInsertRowid;
      } catch (e) {
        console.error('inventory sale → shop_order:', e);
      }

      const saleResult = db
        .prepare(
          `
          INSERT INTO inventory_sales
            (companyId, itemId, quantity, pricePerUnit, total, paymentId, customer, comment, method, shopOrderId, createdAt)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          req.user.companyId,
          id,
          qty,
          ppu,
          total,
          paymentResult.lastInsertRowid,
          String(customer || ''),
          String(comment || ''),
          payMethod,
          shopOrderId,
          now
        );

      return {
        saleId: saleResult.lastInsertRowid,
        paymentId: paymentResult.lastInsertRowid,
        shopOrderId,
        orderNumber,
        total,
        cost
      };
    });

    const result = tx();
    try {
      const clients = require('./clients');
      if (typeof clients.upsertClient === 'function') {
        clients.upsertClient(req.user.companyId, {
          name: String(customer || '').trim() || 'Розничный покупатель',
          phone: String(customerPhone || '').trim(),
        });
      }
    } catch (e) {
      console.error('inventory sale client:', e);
    }
    const updatedItem = db
      .prepare(
        `
        SELECT
          i.*,
          s.name as supplierName,
          c.name as categoryName
        FROM inventory_items i
        LEFT JOIN inventory_suppliers s ON s.id = i.supplierId AND s.companyId = i.companyId
        LEFT JOIN inventory_categories c ON c.id = i.categoryId AND c.companyId = i.companyId
        WHERE i.id = ? AND i.companyId = ?
      `
      )
      .get(id, req.user.companyId);

    res.status(201).json({
      ...result,
      item: updatedItem
    });
  } catch (error) {
    console.error('Ошибка продажи товара со склада:', error);
    res.status(500).json({ error: 'Ошибка продажи товара со склада' });
  }
});

// История продаж (опционально для UI)
router.get('/sales', (req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT s.*, i.name as itemName, i.sku as itemSku
        FROM inventory_sales s
        LEFT JOIN inventory_items i ON i.id = s.itemId AND i.companyId = s.companyId
        WHERE s.companyId = ?
        ORDER BY s.createdAt DESC, s.id DESC
        LIMIT 200
      `
      )
      .all(req.user.companyId);

    res.json(rows);
  } catch (error) {
    console.error('Ошибка получения продаж склада:', error);
    res.status(500).json({ error: 'Ошибка получения продаж склада' });
  }
});


// Удаление позиции склада
router.delete('/items/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = db.prepare('SELECT id FROM inventory_items WHERE id = ? AND companyId = ?').get(id, req.user.companyId);
    if (!item) return res.status(404).json({ error: 'Позиция не найдена' });
    const tx = db.transaction(() => {
      try {
        db.prepare('DELETE FROM inventory_sales WHERE itemId = ? AND companyId = ?').run(id, req.user.companyId);
      } catch {}
      try {
        db.prepare('UPDATE shop_products SET inventoryItemId = NULL WHERE inventoryItemId = ? AND companyId = ?').run(id, req.user.companyId);
      } catch {}
      db.prepare('DELETE FROM inventory_items WHERE id = ? AND companyId = ?').run(id, req.user.companyId);
    });
    tx();
    res.json({ ok: true, id });
  } catch (e) {
    console.error('delete inventory item', e);
    res.status(500).json({ error: 'Не удалось удалить позицию' });
  }
});

module.exports = router;


