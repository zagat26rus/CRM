const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { requireManagement } = require('../middlewares/rbac');

router.use(requireAuth);

const DOC_PREFIXES = {
  repair_receipt: 'КВ',
  cash_receipt_kkm: 'ЧК',
  cash_receipt: 'ЧК',
  torg12: 'ТН',
  material_release: 'МН',
  upd: 'УПД',
  payment_invoice: 'СЧ',
  work_completion_act: 'АВР',
  vat_invoice: 'СФ',
  cash_in_order: 'ПКО',
  cash_out_order: 'РКО',
  warranty_card: 'ГТ',
  acceptance_act: 'АПП',
  acceptance_warranty: 'АПГ',
  tradein_dkp: 'ДКП'
};

function formatDocumentNumber(docType, year, seq) {
  const prefix = DOC_PREFIXES[docType] || 'ДОК';
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

function peekDocumentNumber(companyId, docType = 'repair_receipt') {
  const year = new Date().getFullYear();
  const type = String(docType || 'repair_receipt');
  const row = db.prepare('SELECT counter FROM document_counters WHERE companyId = ? AND year = ? AND docType = ?').get(companyId, year, type);
  const next = (row?.counter || 0) + 1;
  return formatDocumentNumber(type, year, next);
}

function syncCounterFromDocumentNumber(companyId, docType, documentNumber) {
  const match = String(documentNumber).match(/-(\d{4})-(\d+)$/);
  if (!match) return;
  const year = Number(match[1]);
  const seq = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(seq)) return;
  const type = String(docType || 'repair_receipt');
  const row = db.prepare('SELECT counter FROM document_counters WHERE companyId = ? AND year = ? AND docType = ?').get(companyId, year, type);
  if (row) {
    if (seq > row.counter) {
      db.prepare('UPDATE document_counters SET counter = ? WHERE companyId = ? AND year = ? AND docType = ?').run(seq, companyId, year, type);
    }
  } else {
    db.prepare('INSERT INTO document_counters (companyId, year, docType, counter) VALUES (?, ?, ?, ?)').run(companyId, year, type, seq);
  }
}

function nextDocumentNumber(companyId, docType = 'repair_receipt') {
  const year = new Date().getFullYear();
  const type = String(docType || 'repair_receipt');
  const row = db.prepare('SELECT counter FROM document_counters WHERE companyId = ? AND year = ? AND docType = ?').get(companyId, year, type);
  const next = (row?.counter || 0) + 1;
  if (row) {
    db.prepare('UPDATE document_counters SET counter = ? WHERE companyId = ? AND year = ? AND docType = ?').run(next, companyId, year, type);
  } else {
    db.prepare('INSERT INTO document_counters (companyId, year, docType, counter) VALUES (?, ?, ?, ?)').run(companyId, year, type, next);
  }
  return formatDocumentNumber(type, year, next);
}

function allocateDocumentNumber(companyId, docType = 'repair_receipt', preferred = '') {
  const preferredTrim = String(preferred || '').trim();
  if (preferredTrim) {
    syncCounterFromDocumentNumber(companyId, docType, preferredTrim);
    return preferredTrim;
  }
  return nextDocumentNumber(companyId, docType);
}

router.get('/next-number', (req, res) => {
  try {
    const docType = String(req.query.type || 'repair_receipt');
    const number = peekDocumentNumber(req.user.companyId, docType);
    const dateIso = getCurrentTime();
    const date = String(dateIso).slice(0, 10);
    res.json({ documentNumber: number, date, documentDate: date });
  } catch (error) {
    console.error('Ошибка генерации номера документа:', error);
    res.status(500).json({ error: 'Ошибка генерации номера' });
  }
});

router.get('/receipts', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 30));
    const rows = db.prepare(`
      SELECT id, documentNumber, client, phone, brand, model, status, price, createdAt
      FROM orders
      WHERE companyId = ? AND TRIM(COALESCE(documentNumber, '')) != ''
      ORDER BY createdAt DESC, id DESC
      LIMIT ?
    `).all(req.user.companyId, limit);
    res.json(rows);
  } catch (error) {
    console.error('Ошибка списка квитанций:', error);
    res.status(500).json({ error: 'Ошибка загрузки списка' });
  }
});

const DOC_TYPE_LABELS = {
  repair_receipt: 'Квитанция приёма',
  cash_receipt_kkm: 'Чек ККМ',
  cash_receipt: 'Кассовый чек',
  torg12: 'ТОРГ-12',
  material_release: 'Требование-накладная',
  upd: 'УПД',
  payment_invoice: 'Счёт на оплату',
  work_completion_act: 'Акт выполненных работ',
  vat_invoice: 'Счёт-фактура',
  cash_in_order: 'ПКО',
  cash_out_order: 'РКО',
  warranty_card: 'Гарантийный талон',
  acceptance_act: 'Акт приёма-передачи',
  acceptance_warranty: 'Акт и гарантия',
  tradein_dkp: 'ДКП trade-in'
};

const { defaultSaleCategoryForDocType, isSaleCategory } = require('../constants/saleCategories');

const INCOME_DOC_TYPES = new Set([
  'cash_receipt_kkm',
  'cash_receipt',
  'torg12',
  'upd',
  'work_completion_act',
  'cash_in_order',
]);

const EXPENSE_DOC_TYPES = new Set(['cash_out_order', 'material_release']);

function calcCostFromData(data) {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const fromLines = lines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.supplierCost) || 0),
    0
  );
  return fromLines + (Number(data?.costAmount) || 0);
}

function ensureCategoryId(companyId, name, type, description, color) {
  let row = db.prepare('SELECT id FROM categories WHERE companyId = ? AND name = ?').get(companyId, name);
  if (row) return row.id;
  const now = getCurrentTime();
  const result = db.prepare(`
    INSERT INTO categories (companyId, name, type, description, color, icon, isActive, isDefault, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, '', 1, 0, ?, ?)
  `).run(companyId, name, type, description, color, now, now);
  return result.lastInsertRowid;
}

function syncDocumentPayments(companyId, docRow) {
  if (!docRow?.id) return { income: 0, expense: 0 };

  db.prepare('DELETE FROM payments WHERE companyId = ? AND documentId = ?').run(companyId, docRow.id);

  let data = {};
  try {
    data = JSON.parse(docRow.dataJson || '{}');
  } catch {
    data = {};
  }

  const docType = docRow.docType;
  const total = Number(docRow.total) || 0;
  const costTotal = Number(docRow.costTotal) || calcCostFromData(data);
  const saleCategory = isSaleCategory(data?.saleCategory)
    ? data.saleCategory
    : defaultSaleCategoryForDocType(docType);
  const label = DOC_TYPE_LABELS[docType] || docRow.title || docType;
  const descBase = `${label} №${docRow.documentNumber || docRow.id}`;
  const now = getCurrentTime();
  let income = 0;
  let expense = 0;

  if (INCOME_DOC_TYPES.has(docType) && total > 0) {
    const categoryId = ensureCategoryId(
      companyId,
      'Продажа по документу',
      'income',
      'Выручка по документам из раздела «Документация»',
      '#22c55e'
    );
    db.prepare(`
      INSERT INTO payments (companyId, amount, type, categoryId, description, date, documentId, saleCategory, createdAt, updatedAt)
      VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, total, categoryId, descBase, now, docRow.id, saleCategory, now, now);
    income = total;
  }

  if (INCOME_DOC_TYPES.has(docType) && costTotal > 0) {
    const categoryId = ensureCategoryId(
      companyId,
      'Себестоимость по документу',
      'expense',
      'Закупочная стоимость по документам продажи',
      '#ef4444'
    );
    db.prepare(`
      INSERT INTO payments (companyId, amount, type, categoryId, description, date, documentId, createdAt, updatedAt)
      VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      costTotal,
      categoryId,
      `Себестоимость: ${descBase}`,
      now,
      docRow.id,
      now,
      now
    );
    expense += costTotal;
  }

  if (EXPENSE_DOC_TYPES.has(docType) && total > 0) {
    const categoryId = ensureCategoryId(
      companyId,
      'Расход по документу',
      'expense',
      'Расходы по документам',
      '#f59e0b'
    );
    db.prepare(`
      INSERT INTO payments (companyId, amount, type, categoryId, description, date, documentId, createdAt, updatedAt)
      VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?)
    `).run(companyId, total, categoryId, descBase, now, docRow.id, now, now);
    expense += total;
  }

  return { income, expense, profit: income - expense, costTotal };
}

function parseDocRow(row) {
  let data = {};
  try {
    data = JSON.parse(row.dataJson || '{}');
  } catch {
    data = {};
  }
  return {
    id: row.id,
    source: 'document',
    docType: row.docType,
    docTypeLabel: DOC_TYPE_LABELS[row.docType] || row.title || row.docType,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate,
    client: row.client,
    phone: row.phone,
    brand: data.brand || '',
    model: data.model || '',
    status: 'Сохранён',
    total: Number(row.total) || 0,
    costTotal: Number(row.costTotal) || calcCostFromData(data),
    profit: (Number(row.total) || 0) - (Number(row.costTotal) || calcCostFromData(data)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data
  };
}

router.get('/history', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const orders = db.prepare(`
      SELECT id, documentNumber, client, phone, brand, model, status, price, costPrice, createdAt
      FROM orders
      WHERE companyId = ? AND TRIM(COALESCE(documentNumber, '')) != ''
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(req.user.companyId, limit);

    const docs = db.prepare(`
      SELECT * FROM company_documents
      WHERE companyId = ?
      ORDER BY updatedAt DESC, id DESC
      LIMIT ?
    `).all(req.user.companyId, limit);

    const merged = [
      ...orders.map((o) => ({
        id: o.id,
        source: 'order',
        docType: 'repair_receipt',
        docTypeLabel: DOC_TYPE_LABELS.repair_receipt,
        documentNumber: o.documentNumber,
        client: o.client,
        phone: o.phone,
        brand: o.brand,
        model: o.model,
        status: o.status,
        price: Number(o.price) || 0,
        costPrice: Number(o.costPrice) || 0,
        total: Number(o.price) || 0,
        costTotal: Number(o.costPrice) || 0,
        profit: (Number(o.price) || 0) - (Number(o.costPrice) || 0),
        createdAt: o.createdAt
      })),
      ...docs.map(parseDocRow)
    ]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit);

    res.json(merged);
  } catch (error) {
    console.error('Ошибка истории документов:', error);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM company_documents WHERE id = ? AND companyId = ?').get(req.params.id, req.user.companyId);
    if (!row) return res.status(404).json({ error: 'Документ не найден' });
    res.json(parseDocRow(row));
  } catch (error) {
    console.error('Ошибка получения документа:', error);
    res.status(500).json({ error: 'Ошибка загрузки документа' });
  }
});

router.post('/', (req, res) => {
  try {
    const {
      docType,
      documentNumber = '',
      documentDate = '',
      client = '',
      phone = '',
      orderId = null,
      data = {},
      total = 0,
      costTotal = 0,
      title = '',
      syncPayments = false
    } = req.body;

    if (!docType) return res.status(400).json({ error: 'Не указан тип документа' });

    const now = getCurrentTime();
    const docNum = allocateDocumentNumber(req.user.companyId, docType, documentNumber);
    const docTitle = title || DOC_TYPE_LABELS[docType] || String(docType);
    const parsedCost = Number(costTotal) || calcCostFromData(data || {});

    const result = db.prepare(`
      INSERT INTO company_documents (
        companyId, docType, documentNumber, documentDate, orderId,
        client, phone, title, dataJson, total, costTotal, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.companyId,
      String(docType),
      docNum,
      String(documentDate || '').slice(0, 10),
      orderId || null,
      String(client || ''),
      String(phone || ''),
      docTitle,
      JSON.stringify(data || {}),
      Number(total) || 0,
      parsedCost,
      now,
      now
    );

    const row = db.prepare('SELECT * FROM company_documents WHERE id = ?').get(result.lastInsertRowid);
    let paymentSync = null;
    if (syncPayments) {
      paymentSync = syncDocumentPayments(req.user.companyId, row);
    }
    res.status(201).json({ ...parseDocRow(row), paymentSync });
  } catch (error) {
    console.error('Ошибка сохранения документа:', error);
    res.status(500).json({ error: 'Ошибка сохранения документа' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM company_documents WHERE id = ? AND companyId = ?').get(req.params.id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Документ не найден' });

    const {
      documentNumber,
      documentDate,
      client,
      phone,
      data,
      total,
      costTotal,
      title,
      syncPayments = false
    } = req.body;

    const now = getCurrentTime();
    const docNum = documentNumber !== undefined
      ? allocateDocumentNumber(req.user.companyId, existing.docType, documentNumber)
      : existing.documentNumber;

    const nextData = data !== undefined ? data : JSON.parse(existing.dataJson || '{}');
    const nextTotal = total !== undefined ? Number(total) || 0 : existing.total;
    const nextCost = costTotal !== undefined
      ? Number(costTotal) || 0
      : (data !== undefined ? calcCostFromData(nextData) : (Number(existing.costTotal) || calcCostFromData(nextData)));

    db.prepare(`
      UPDATE company_documents SET
        documentNumber = ?,
        documentDate = ?,
        client = ?,
        phone = ?,
        title = ?,
        dataJson = ?,
        total = ?,
        costTotal = ?,
        updatedAt = ?
      WHERE id = ? AND companyId = ?
    `).run(
      docNum,
      documentDate !== undefined ? String(documentDate).slice(0, 10) : existing.documentDate,
      client !== undefined ? String(client) : existing.client,
      phone !== undefined ? String(phone) : existing.phone,
      title !== undefined ? String(title) : existing.title,
      data !== undefined ? JSON.stringify(data) : existing.dataJson,
      nextTotal,
      nextCost,
      now,
      req.params.id,
      req.user.companyId
    );

    const row = db.prepare('SELECT * FROM company_documents WHERE id = ?').get(req.params.id);
    let paymentSync = null;
    if (syncPayments) {
      paymentSync = syncDocumentPayments(req.user.companyId, row);
    }
    res.json({ ...parseDocRow(row), paymentSync });
  } catch (error) {
    console.error('Ошибка обновления документа:', error);
    res.status(500).json({ error: 'Ошибка обновления документа' });
  }
});

router.delete('/:id', requireManagement, (req, res) => {
  try {
    const companyId = req.user.companyId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM company_documents WHERE id = ? AND companyId = ?').get(id, companyId);
    if (!row) return res.status(404).json({ error: 'Документ не найден' });

    let deletedPayments = 0;
    const tx = db.transaction(() => {
      deletedPayments = db.prepare('DELETE FROM payments WHERE companyId = ? AND documentId = ?').run(companyId, id).changes || 0;
      db.prepare('DELETE FROM company_documents WHERE id = ? AND companyId = ?').run(id, companyId);
    });
    tx();

    res.json({ ok: true, deletedPayments });
  } catch (error) {
    console.error('Ошибка удаления документа:', error);
    res.status(500).json({ error: 'Ошибка удаления документа' });
  }
});

router.post('/:id/finalize', requireManagement, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM company_documents WHERE id = ? AND companyId = ?').get(req.params.id, req.user.companyId);
    if (!row) return res.status(404).json({ error: 'Документ не найден' });
    const paymentSync = syncDocumentPayments(req.user.companyId, row);
    res.json({ ok: true, ...parseDocRow(row), paymentSync });
  } catch (error) {
    console.error('Ошибка проведения документа:', error);
    res.status(500).json({ error: 'Ошибка проведения документа' });
  }
});

module.exports = router;
module.exports.nextDocumentNumber = nextDocumentNumber;
module.exports.peekDocumentNumber = peekDocumentNumber;
module.exports.allocateDocumentNumber = allocateDocumentNumber;
