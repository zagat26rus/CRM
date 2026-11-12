const { db, getCurrentTime } = require('../config/database')

function ensureDefaultRegister(companyId) {
  const existing = db
    .prepare(
      'SELECT * FROM cash_registers WHERE companyId = ? AND isActive = 1 ORDER BY isDefault DESC, id ASC LIMIT 1'
    )
    .get(companyId)
  if (existing) return existing
  const now = getCurrentTime()
  const r = db
    .prepare(
      `
    INSERT INTO cash_registers (companyId, name, type, isDefault, isActive, createdAt, updatedAt)
    VALUES (?, 'Основная касса', 'cash', 1, 1, ?, ?)
  `
    )
    .run(companyId, now, now)
  return db.prepare('SELECT * FROM cash_registers WHERE id = ?').get(r.lastInsertRowid)
}

function resolveCashRegisterId(companyId, rawId) {
  const id = Number(rawId)
  if (Number.isFinite(id) && id > 0) {
    const row = db
      .prepare('SELECT id FROM cash_registers WHERE id = ? AND companyId = ? AND isActive = 1')
      .get(id, companyId)
    if (row) return row.id
  }
  return ensureDefaultRegister(companyId).id
}

module.exports = { ensureDefaultRegister, resolveCashRegisterId }
