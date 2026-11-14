const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const { db, getCurrentTime } = require('../config/database')
const { requireAuth } = require('../middlewares/auth')
const { requireManagement, requireFinance } = require('../middlewares/rbac')
const { ensureDefaultRegister } = require('../utils/cashRegisters')

router.use(requireAuth)

function registerBalance(companyId, cashRegisterId) {
  const row = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
    FROM payments
    WHERE companyId = ? AND cashRegisterId = ?
  `
    )
    .get(companyId, cashRegisterId)
  return Number(row?.income || 0) - Number(row?.expense || 0)
}

function formatRegister(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'cash',
    isDefault: Boolean(row.isDefault),
    isActive: row.isActive !== 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

router.get('/', (req, res) => {
  try {
    ensureDefaultRegister(req.user.companyId)
    const includeInactive = String(req.query.all || '') === '1'
    const rows = includeInactive
      ? db
          .prepare('SELECT * FROM cash_registers WHERE companyId = ? ORDER BY isDefault DESC, name ASC')
          .all(req.user.companyId)
      : db
          .prepare(
            'SELECT * FROM cash_registers WHERE companyId = ? AND isActive = 1 ORDER BY isDefault DESC, name ASC'
          )
          .all(req.user.companyId)

    const balances = db
      .prepare(
        `
      SELECT cashRegisterId,
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
      FROM payments
      WHERE companyId = ? AND cashRegisterId IS NOT NULL
      GROUP BY cashRegisterId
    `
      )
      .all(req.user.companyId)
    const balMap = new Map(balances.map((b) => [b.cashRegisterId, Number(b.income || 0) - Number(b.expense || 0)]))

    res.json(
      rows.map((r) => ({
        ...formatRegister(r),
        balance: balMap.get(r.id) ?? 0,
      }))
    )
  } catch (error) {
    console.error('Ошибка списка касс:', error)
    res.status(500).json({ error: 'Ошибка загрузки касс' })
  }
})

router.post('/', requireManagement, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const type = String(req.body?.type || 'cash').trim() || 'cash'
    if (!name) return res.status(400).json({ error: 'Укажите название кассы' })

    const now = getCurrentTime()
    const count = db.prepare('SELECT COUNT(*) as c FROM cash_registers WHERE companyId = ?').get(req.user.companyId)?.c || 0
    const makeDefault = Boolean(req.body?.isDefault) || Number(count) === 0

    if (makeDefault) {
      db.prepare('UPDATE cash_registers SET isDefault = 0 WHERE companyId = ?').run(req.user.companyId)
    }

    const r = db
      .prepare(
        `
      INSERT INTO cash_registers (companyId, name, type, isDefault, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `
      )
      .run(req.user.companyId, name, type, makeDefault ? 1 : 0, now, now)

    res.status(201).json(formatRegister(db.prepare('SELECT * FROM cash_registers WHERE id = ?').get(r.lastInsertRowid)))
  } catch (error) {
    console.error('Ошибка создания кассы:', error)
    res.status(500).json({ error: 'Ошибка создания кассы' })
  }
})

router.post('/transfer', requireFinance, (req, res) => {
  try {
    ensureDefaultRegister(req.user.companyId)
    const fromId = Number(req.body?.fromId)
    const toId = Number(req.body?.toId)
    const amount = Number(req.body?.amount)
    const comment = String(req.body?.comment || '').trim()
    const method = String(req.body?.method || 'cash').trim() || 'cash'

    if (!Number.isFinite(fromId) || fromId <= 0 || !Number.isFinite(toId) || toId <= 0) {
      return res.status(400).json({ error: 'Укажите кассы перевода' })
    }
    if (fromId === toId) {
      return res.status(400).json({ error: 'Кассы перевода должны отличаться' })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Введите корректную сумму' })
    }

    const fromReg = db
      .prepare('SELECT * FROM cash_registers WHERE id = ? AND companyId = ? AND isActive = 1')
      .get(fromId, req.user.companyId)
    const toReg = db
      .prepare('SELECT * FROM cash_registers WHERE id = ? AND companyId = ? AND isActive = 1')
      .get(toId, req.user.companyId)
    if (!fromReg || !toReg) {
      return res.status(400).json({ error: 'Одна из касс не найдена или отключена' })
    }

    const fromBalance = registerBalance(req.user.companyId, fromId)
    if (amount > fromBalance + 1e-9) {
      return res.status(400).json({
        error: `Недостаточно средств в «${fromReg.name}». Остаток: ${fromBalance.toLocaleString('ru-RU')} ₽`,
      })
    }

    const transferGroupId = crypto.randomUUID()
    const now = getCurrentTime()
    const baseComment = comment || `Перевод: ${fromReg.name} → ${toReg.name}`
    const expenseDesc = `Перевод в «${toReg.name}»${comment ? `: ${comment}` : ''}`
    const incomeDesc = `Перевод из «${fromReg.name}»${comment ? `: ${comment}` : ''}`

    const insert = db.prepare(`
      INSERT INTO payments
        (companyId, amount, type, categoryId, description, date, saleCategory, method, cashRegisterId, transferGroupId, createdAt, updatedAt)
      VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)
    `)

    const tx = db.transaction(() => {
      const expense = insert.run(
        req.user.companyId,
        amount,
        'expense',
        expenseDesc,
        now,
        method,
        fromId,
        transferGroupId,
        now,
        now
      )
      const income = insert.run(
        req.user.companyId,
        amount,
        'income',
        incomeDesc,
        now,
        method,
        toId,
        transferGroupId,
        now,
        now
      )
      return { expenseId: expense.lastInsertRowid, incomeId: income.lastInsertRowid }
    })

    const result = tx()

    res.status(201).json({
      ok: true,
      transferGroupId,
      amount,
      comment: baseComment,
      from: { id: fromReg.id, name: fromReg.name, balance: registerBalance(req.user.companyId, fromId) },
      to: { id: toReg.id, name: toReg.name, balance: registerBalance(req.user.companyId, toId) },
      expensePaymentId: result.expenseId,
      incomePaymentId: result.incomeId,
    })
  } catch (error) {
    console.error('Ошибка перевода между кассами:', error)
    res.status(500).json({ error: 'Ошибка перевода между кассами' })
  }
})

router.put('/:id', requireManagement, (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = db.prepare('SELECT * FROM cash_registers WHERE id = ? AND companyId = ?').get(id, req.user.companyId)
    if (!existing) return res.status(404).json({ error: 'Касса не найдена' })

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name
    const type = req.body?.type !== undefined ? String(req.body.type).trim() || existing.type : existing.type
    const isActive = req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : existing.isActive
    let isDefault = existing.isDefault

    if (!name) return res.status(400).json({ error: 'Укажите название кассы' })

    if (req.body?.isDefault) {
      db.prepare('UPDATE cash_registers SET isDefault = 0 WHERE companyId = ?').run(req.user.companyId)
      isDefault = 1
    }

    if (!isActive && existing.isDefault) {
      return res.status(400).json({ error: 'Нельзя отключить кассу по умолчанию. Сначала назначьте другую.' })
    }

    db.prepare(
      `
      UPDATE cash_registers
      SET name = ?, type = ?, isDefault = ?, isActive = ?, updatedAt = ?
      WHERE id = ? AND companyId = ?
    `
    ).run(name, type, isDefault ? 1 : 0, isActive, getCurrentTime(), id, req.user.companyId)

    res.json(formatRegister(db.prepare('SELECT * FROM cash_registers WHERE id = ?').get(id)))
  } catch (error) {
    console.error('Ошибка обновления кассы:', error)
    res.status(500).json({ error: 'Ошибка обновления кассы' })
  }
})

router.delete('/:id', requireManagement, (req, res) => {
  try {
    const id = Number(req.params.id)
    const existing = db.prepare('SELECT * FROM cash_registers WHERE id = ? AND companyId = ?').get(id, req.user.companyId)
    if (!existing) return res.status(404).json({ error: 'Касса не найдена' })
    if (existing.isDefault) return res.status(400).json({ error: 'Нельзя удалить кассу по умолчанию' })

    const used = db.prepare('SELECT COUNT(*) as c FROM payments WHERE cashRegisterId = ?').get(id)?.c || 0
    if (used > 0) {
      db.prepare('UPDATE cash_registers SET isActive = 0, updatedAt = ? WHERE id = ?').run(getCurrentTime(), id)
      return res.json({ ok: true, deactivated: true })
    }

    db.prepare('DELETE FROM cash_registers WHERE id = ? AND companyId = ?').run(id, req.user.companyId)
    res.json({ ok: true, deleted: true })
  } catch (error) {
    console.error('Ошибка удаления кассы:', error)
    res.status(500).json({ error: 'Ошибка удаления кассы' })
  }
})

module.exports = router
