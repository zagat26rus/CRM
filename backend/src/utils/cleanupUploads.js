/**
 * Удаляет фото и вложения старше 90 дней (3 месяца).
 * Запуск: node src/utils/cleanupUploads.js
 * Cron: 0 3 * * * cd /var/www/black-crm/back && node src/utils/cleanupUploads.js >> /var/log/fixnet-cleanup.log 2>&1
 */
const fs = require('fs')
const path = require('path')

const ROOT_CANDIDATES = [
  path.join(__dirname, '..', '..', 'uploads'),
  path.join(__dirname, '..', '..', '..', 'uploads'),
  '/var/www/black-crm/back/uploads',
]

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

function rmOld(dir, maxAgeMs) {
  if (!fs.existsSync(dir)) return { dir, removed: 0, kept: 0 }
  const now = Date.now()
  let removed = 0
  let kept = 0
  const walk = (p) => {
    let entries = []
    try {
      entries = fs.readdirSync(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(p, ent.name)
      if (ent.isDirectory()) {
        walk(full)
        try {
          if (fs.readdirSync(full).length === 0) fs.rmdirSync(full)
        } catch {}
        continue
      }
      if (!IMAGE_EXT.test(ent.name)) {
        kept++
        continue
      }
      try {
        const st = fs.statSync(full)
        if (now - st.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full)
          removed++
        } else {
          kept++
        }
      } catch {}
    }
  }
  walk(dir)
  return { dir, removed, kept }
}

function cleanupOldUploads(maxAgeDays = 90) {
  const maxAgeMs = Math.max(1, Number(maxAgeDays) || 90) * 24 * 60 * 60 * 1000
  const seen = new Set()
  const results = []
  for (const root of ROOT_CANDIDATES) {
    const resolved = path.resolve(root)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    const r = rmOld(resolved, maxAgeMs)
    results.push(r)
    console.log(new Date().toISOString(), r)
  }
  return results
}

if (require.main === module) {
  cleanupOldUploads(90)
}

module.exports = { cleanupOldUploads, MAX_AGE_MS }
