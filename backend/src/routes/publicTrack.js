const express = require('express')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { db } = require('../config/database')

const router = express.Router()

function safeParseJson(text, fallback) {
  try {
    const v = JSON.parse(String(text || ''))
    return v === null || v === undefined ? fallback : v
  } catch {
    return fallback
  }
}

function ensurePublicTokenColumn() {
  try {
    db.exec('ALTER TABLE orders ADD COLUMN publicToken TEXT')
  } catch {}
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON orders(publicToken)')
  } catch {}
}

ensurePublicTokenColumn()

function newPublicToken() {
  return crypto.randomBytes(12).toString('hex')
}

function ensureOrderPublicToken(orderId) {
  ensurePublicTokenColumn()
  const row = db.prepare('SELECT id, publicToken FROM orders WHERE id = ?').get(orderId)
  if (!row) return null
  if (row.publicToken) return row.publicToken
  for (let i = 0; i < 5; i++) {
    const token = newPublicToken()
    try {
      db.prepare('UPDATE orders SET publicToken = ? WHERE id = ? AND (publicToken IS NULL OR publicToken = \'\')').run(
        token,
        orderId
      )
      const again = db.prepare('SELECT publicToken FROM orders WHERE id = ?').get(orderId)
      if (again?.publicToken) return again.publicToken
    } catch {
      // unique collision — retry
    }
  }
  return null
}

function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 7) return phone || ''
  const tail = d.slice(-2)
  if (d.length >= 11) return `+${d[0]} (${d.slice(1, 4)}) ***-**-${tail}`
  return `***-**-${tail}`
}

/** Подпись доступна только по длинному секретному токену заявки. */
router.get('/track/:token/signature', (req, res) => {
  try {
    const token = String(req.params.token || '').trim()
    if (!token || token.length < 8) return res.status(400).json({ error: 'Некорректный код' })
    const order = db
      .prepare('SELECT id, clientSignatureUrl FROM orders WHERE publicToken = ?')
      .get(token)
    if (!order?.clientSignatureUrl) return res.status(404).json({ error: 'Подпись не найдена' })
    const filePath = path.join(__dirname, '..', '..', 'data', 'signatures', `order-${Number(order.id)}.png`)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Подпись не найдена' })
    res.set('Cache-Control', 'private, no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    res.type('png')
    res.sendFile(filePath)
  } catch (e) {
    console.error('public signature error', e)
    res.status(500).json({ error: 'Ошибка загрузки подписи' })
  }
})

/** GET /api/public/track/:token */
router.get('/track/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim()
    if (!token || token.length < 8) {
      return res.status(400).json({ error: 'Некорректный код' })
    }

    const order = db.prepare('SELECT * FROM orders WHERE publicToken = ?').get(token)
    if (!order) {
      return res.status(404).json({ error: 'Заявка не найдена' })
    }

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(order.companyId)
    let settings = {}
    try {
      settings = JSON.parse(String(company?.settingsJson || '{}')) || {}
    } catch {
      settings = {}
    }

    const problems = db
      .prepare(
        'SELECT problemName, problemDescription, price FROM order_problems WHERE orderId = ? ORDER BY sortOrder ASC'
      )
      .all(order.id)

    const history = db
      .prepare(
        `SELECT type, message, attachments, createdAt
         FROM order_history
         WHERE orderId = ? AND companyId = ?
         ORDER BY datetime(createdAt) DESC
         LIMIT 40`
      )
      .all(order.id, order.companyId)

    const attachments = []
    for (const h of history) {
      const atts = safeParseJson(h.attachments, [])
      if (!Array.isArray(atts)) continue
      for (const a of atts) {
        if (!a?.url) continue
        attachments.push({
          name: a.name || 'Файл',
          url: a.url,
          mime: a.mime || '',
          createdAt: h.createdAt,
          message: h.message || '',
        })
      }
    }

    const acceptanceSnapshot = safeParseJson(order.acceptanceSnapshot, {})
    const hasSignedAcceptance = Boolean(order.clientSignatureUrl && order.clientSignedAt)
    const acceptanceDocument = hasSignedAcceptance
      ? {
          ...acceptanceSnapshot,
          id: order.id,
          documentNumber: order.documentNumber || String(order.id),
          publicToken: order.publicToken,
          clientSignatureUrl: order.clientSignatureUrl,
          clientSignedAt: order.clientSignedAt,
          acceptanceTermsVersion: order.acceptanceTermsVersion || '',
        }
      : null

    res.set('Cache-Control', 'private, no-store')
    res.json({
      order: {
        id: order.id,
        documentNumber: order.documentNumber || String(order.id),
        status: order.status,
        client: order.client,
        phoneMasked: maskPhone(order.phone),
        brand: order.brand,
        model: order.model,
        deviceType: order.deviceType,
        problem: order.problem,
        description: order.description,
        dueAt: order.dueAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        estimatedPrice: order.estimatedPrice,
        problems: problems.map((p) => ({
          name: p.problemName,
          description: p.problemDescription,
        })),
      },
      acceptanceDocument,
      service: {
        name: company?.name || settings.name || 'FixNet',
        address: company?.address || settings.address || 'г. Ставрополь, ул. Мимоз, д. 26/1',
        phone: company?.phone || settings.phone || '+7 (993) 309-08-28',
        email: company?.email || settings.email || 'fixnet@mail.ru',
        workHours: settings.workHours || settings.workingHours || 'с 10:00 до 20:00 (пн–пт), с 10:00 до 17:00 (сб–вс)',
      },
      attachments,
      timeline: history
        .filter((h) => h.type === 'status' || h.type === 'comment' || h.type === 'system')
        .slice(0, 15)
        .map((h) => ({
          type: h.type,
          message: h.message,
          createdAt: h.createdAt,
        })),
    })
  } catch (e) {
    console.error('public track error', e)
    res.status(500).json({ error: 'Ошибка загрузки статуса' })
  }
})

module.exports = router
module.exports.ensurePublicTokenColumn = ensurePublicTokenColumn
module.exports.newPublicToken = newPublicToken
module.exports.ensureOrderPublicToken = ensureOrderPublicToken
