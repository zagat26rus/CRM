const express = require('express')
const router = express.Router()
const { db, getCurrentTime } = require('../config/database')
const { requireAuth } = require('../middlewares/auth')
const { requireFinance } = require('../middlewares/rbac')
const { resolveCashRegisterId } = require('../utils/cashRegisters')

router.use(requireAuth)

function nextDocumentNumber(companyId, docType = 'tradein_dkp') {
  const year = new Date().getFullYear()
  const row = db
    .prepare('SELECT counter FROM document_counters WHERE companyId = ? AND year = ? AND docType = ?')
    .get(companyId, year, docType)
  const next = (row?.counter || 0) + 1
  if (row) {
    db.prepare('UPDATE document_counters SET counter = ? WHERE companyId = ? AND year = ? AND docType = ?').run(
      next,
      companyId,
      year,
      docType
    )
  } else {
    db.prepare('INSERT INTO document_counters (companyId, year, docType, counter) VALUES (?, ?, ?, ?)').run(
      companyId,
      year,
      docType,
      next
    )
  }
  return `ДКП-${year}-${String(next).padStart(4, '0')}`
}

function upsertClient(companyId, { name, phone, email, address }) {
  const now = getCurrentTime()
  const cleanPhone = String(phone || '').trim()
  const cleanName = String(name || '').trim()
  if (!cleanName) return null

  let client = null
  if (cleanPhone) {
    const digits = cleanPhone.replace(/\D/g, '')
    client = db
      .prepare(
        `
      SELECT * FROM clients WHERE companyId = ? AND (
        phone = ? OR replace(replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')',''),'+','') = ?
      ) LIMIT 1
    `
      )
      .get(companyId, cleanPhone, digits)
  }

  if (client) {
    db.prepare(
      `
      UPDATE clients SET name = ?, phone = COALESCE(NULLIF(?, ''), phone), email = COALESCE(NULLIF(?, ''), email),
        updatedAt = ?
      WHERE id = ?
    `
    ).run(cleanName, cleanPhone, String(email || ''), now, client.id)
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id)
  }

  const r = db
    .prepare(
      `
    INSERT INTO clients (companyId, name, phone, email, totalOrders, totalSpent, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `
    )
    .run(companyId, cleanName, cleanPhone, String(email || ''), now, now)
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(r.lastInsertRowid)
}

function defaultWarehouseId(companyId) {
  const wh =
    db
      .prepare(
        'SELECT id FROM inventory_warehouses WHERE companyId = ? AND isActive = 1 ORDER BY isDefault DESC, id ASC LIMIT 1'
      )
      .get(companyId) ||
    db.prepare('SELECT id FROM inventory_warehouses WHERE companyId = ? ORDER BY id ASC LIMIT 1').get(companyId)
  if (wh) return wh.id
  const now = getCurrentTime()
  const r = db
    .prepare(
      `
    INSERT INTO inventory_warehouses (companyId, name, address, isDefault, isActive, createdAt, updatedAt)
    VALUES (?, 'Основной склад', '', 1, 1, ?, ?)
  `
    )
    .run(companyId, now, now)
  return r.lastInsertRowid
}

function tradeInCategoryId(companyId) {
  const existing = db
    .prepare(
      `SELECT id FROM inventory_categories
       WHERE companyId = ? AND (lower(name) LIKE '%trade%' OR name = 'Trade-in / БУ')
       LIMIT 1`
    )
    .get(companyId)
  if (existing) return existing.id
  const now = getCurrentTime()
  const r = db
    .prepare(
      `
    INSERT INTO inventory_categories (companyId, name, isActive, createdAt, updatedAt)
    VALUES (?, 'Trade-in / БУ', 1, ?, ?)
  `
    )
    .run(companyId, now, now)
  return r.lastInsertRowid
}

/**
 * Приём б/у телефона у клиента:
 * склад + расход (выкуп) + ДКП документ + запись trade_ins
 */
router.post('/', requireFinance, (req, res) => {
  try {
    const body = req.body || {}
    const sellerName = String(body.sellerName || body.clientName || '').trim()
    const sellerPhone = String(body.sellerPhone || body.clientPhone || '').trim()
    const sellerPassport = String(body.sellerPassport || '').trim()
    const sellerAddress = String(body.sellerAddress || '').trim()
    const sellerEmail = String(body.sellerEmail || '').trim()

    const brand = String(body.brand || '').trim()
    const model = String(body.model || '').trim()
    const color = String(body.color || '').trim()
    const memory = String(body.memory || '').trim()
    const imei = String(body.imei || '').trim()
    const imei2 = String(body.imei2 || '').trim()
    const serialNumber = String(body.serialNumber || '').trim()
    const equipment = String(body.equipment || '').trim()
    const conditionGrade = String(body.conditionGrade || '').trim()
    const conditionNotes = String(body.conditionNotes || body.condition || '').trim()
    const buyPrice = Number(body.buyPrice)
    const salePrice = Number(body.salePrice)
    const method = String(body.method || 'cash').trim().toLowerCase() || 'cash'
    const warehouseId = Number(body.warehouseId) || defaultWarehouseId(req.user.companyId)
    const cashRegisterId = resolveCashRegisterId(req.user.companyId, body.cashRegisterId)

    if (!sellerName) return res.status(400).json({ error: 'Укажите ФИО продавца (клиента)' })
    if (!brand || !model) return res.status(400).json({ error: 'Укажите бренд и модель телефона' })
    if (!imei && !serialNumber) return res.status(400).json({ error: 'Укажите IMEI или серийный номер' })
    if (!Number.isFinite(buyPrice) || buyPrice < 0) return res.status(400).json({ error: 'Укажите цену выкупа' })
    if (!sellerPassport) return res.status(400).json({ error: 'Укажите паспортные данные продавца (для ДКП)' })

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.companyId)
    const now = getCurrentTime()
    const itemName = [brand, model, memory, color].filter(Boolean).join(' ').trim()
    const resolvedSalePrice = Number.isFinite(salePrice) && salePrice > 0 ? salePrice : Math.round(buyPrice * 1.2)

    const tx = db.transaction(() => {
      const client = upsertClient(req.user.companyId, {
        name: sellerName,
        phone: sellerPhone,
        email: sellerEmail,
        address: sellerAddress,
      })

      const categoryId = tradeInCategoryId(req.user.companyId)
      const descriptionParts = [
        'Trade-in БУ',
        conditionGrade ? `состояние: ${conditionGrade}` : '',
        conditionNotes,
        equipment ? `комплект: ${equipment}` : '',
        imei ? `IMEI: ${imei}` : '',
        imei2 ? `IMEI2: ${imei2}` : '',
        serialNumber ? `S/N: ${serialNumber}` : '',
      ].filter(Boolean)

      const itemResult = db
        .prepare(
          `
        INSERT INTO inventory_items (
          companyId, warehouseId, name, sku, categoryId, purchasePrice, salePrice, quantity, unit, description,
          imei, imei2, serialNumber, conditionGrade, conditionNotes, source, brand, model, color, memory,
          tradeInClientId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'шт', ?, ?, ?, ?, ?, ?, 'trade_in', ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          req.user.companyId,
          warehouseId,
          itemName,
          imei || serialNumber || '',
          categoryId,
          buyPrice,
          resolvedSalePrice,
          descriptionParts.join(' · '),
          imei,
          imei2,
          serialNumber,
          conditionGrade,
          conditionNotes,
          brand,
          model,
          color,
          memory,
          client?.id || null,
          now,
          now
        )
      const itemId = itemResult.lastInsertRowid

      let expenseCategoryId = null
      const expenseCat = db
        .prepare(
          `SELECT id FROM categories WHERE companyId = ? AND type = 'expense' AND (name LIKE '%Trade%' OR name LIKE '%выкуп%' OR name LIKE '%Запчаст%') LIMIT 1`
        )
        .get(req.user.companyId)
      if (expenseCat) expenseCategoryId = expenseCat.id
      else {
        const anyExp = db
          .prepare(`SELECT id FROM categories WHERE companyId = ? AND type = 'expense' AND isActive = 1 ORDER BY isDefault DESC LIMIT 1`)
          .get(req.user.companyId)
        expenseCategoryId = anyExp?.id || null
      }

      let paymentId = null
      if (buyPrice > 0) {
        const pay = db
          .prepare(
            `
          INSERT INTO payments
          (companyId, amount, type, categoryId, description, date, saleCategory, method, cashRegisterId, createdAt, updatedAt)
          VALUES (?, ?, 'expense', ?, ?, ?, NULL, ?, ?, ?, ?)
        `
          )
          .run(
            req.user.companyId,
            buyPrice,
            expenseCategoryId,
            `Выкуп trade-in: ${itemName}${imei ? ` · IMEI ${imei}` : ''}`,
            now,
            method,
            cashRegisterId,
            now,
            now
          )
        paymentId = pay.lastInsertRowid
      }

      const documentNumber = nextDocumentNumber(req.user.companyId, 'tradein_dkp')
      const docData = {
        documentNumber,
        documentDate: String(now).slice(0, 10),
        buyerCompanyName: company?.name || '',
        buyerInn: company?.inn || '',
        buyerAddress: company?.address || '',
        buyerCity: company?.city || '',
        sellerName,
        sellerPhone,
        sellerPassport,
        sellerAddress,
        brand,
        model,
        color,
        memory,
        imei,
        imei2,
        serialNumber,
        equipment,
        conditionGrade,
        conditionNotes,
        buyPrice,
        amount: buyPrice,
      }

      const doc = db
        .prepare(
          `
        INSERT INTO company_documents
        (companyId, docType, documentNumber, documentDate, client, phone, title, dataJson, total, costTotal, createdAt, updatedAt)
        VALUES (?, 'tradein_dkp', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `
        )
        .run(
          req.user.companyId,
          documentNumber,
          docData.documentDate,
          sellerName,
          sellerPhone,
          `ДКП trade-in: ${itemName}`,
          JSON.stringify(docData),
          buyPrice,
          now,
          now
        )
      const documentId = doc.lastInsertRowid

      db.prepare('UPDATE inventory_items SET tradeInDocumentId = ? WHERE id = ?').run(documentId, itemId)

      const trade = db
        .prepare(
          `
        INSERT INTO trade_ins
        (companyId, clientId, inventoryItemId, documentId, paymentId, cashRegisterId, buyPrice,
         sellerName, sellerPhone, sellerPassport, sellerAddress, deviceJson, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          req.user.companyId,
          client?.id || null,
          itemId,
          documentId,
          paymentId,
          cashRegisterId,
          buyPrice,
          sellerName,
          sellerPhone,
          sellerPassport,
          sellerAddress,
          JSON.stringify({
            brand,
            model,
            color,
            memory,
            imei,
            imei2,
            serialNumber,
            equipment,
            conditionGrade,
            conditionNotes,
          }),
          now,
          now
        )

      return {
        tradeInId: trade.lastInsertRowid,
        itemId,
        documentId,
        paymentId,
        documentNumber,
        docData,
        item: db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId),
        client,
      }
    })

    const result = tx()
    res.status(201).json(result)
  } catch (error) {
    console.error('Ошибка trade-in:', error)
    res.status(500).json({ error: error.message || 'Ошибка приёма устройства' })
  }
})

router.get('/', (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT t.*, i.name as itemName, i.imei, i.brand, i.model
      FROM trade_ins t
      LEFT JOIN inventory_items i ON i.id = t.inventoryItemId
      WHERE t.companyId = ?
      ORDER BY t.id DESC
      LIMIT 100
    `
      )
      .all(req.user.companyId)
    res.json(rows)
  } catch (error) {
    console.error('Ошибка списка trade-in:', error)
    res.status(500).json({ error: 'Ошибка загрузки' })
  }
})

module.exports = router
