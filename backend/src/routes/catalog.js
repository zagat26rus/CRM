const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

function ensureCatalogTable() {
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
}

// Поиск цены из синхронизированного каталога сайта
router.get('/price', (req, res) => {
  try {
    ensureCatalogTable();
    const companyId = req.user.companyId;
    const {
      brand = '',
      model = '',
      problemName = '',
      problemId = '',
      partType = 'original',
      cityCode = '',
    } = req.query;

    const brandName = String(brand).trim();
    const modelName = String(model).trim();
    const problem = String(problemName).trim();
    const part = String(partType || 'original').trim() || 'original';
    const city = String(cityCode || '').trim();

    if (!brandName || !modelName) {
      return res.status(400).json({ error: 'Укажите brand и model' });
    }

    // Case-insensitive brand/model match for intake typing variants
    const deviceModel = db.prepare(`
      SELECT m.id, m.name, m.deviceType, b.name AS brandName
      FROM device_models m
      JOIN brands b ON b.id = m.brandId
      WHERE b.companyId = ? AND lower(b.name) = lower(?) AND lower(m.name) = lower(?)
      LIMIT 1
    `).get(companyId, brandName, modelName);

    if (!deviceModel) {
      return res.json({ found: false, reason: 'model_not_found' });
    }

    const cityOrderSql = `
      CASE
        WHEN cityCode = ? THEN 0
        WHEN cityCode = 'default' THEN 1
        WHEN cityCode = '' OR cityCode IS NULL THEN 2
        ELSE 3
      END
    `;

    function pickByIssueCode(issueCode) {
      return db.prepare(`
        SELECT * FROM catalog_prices
        WHERE companyId = ? AND deviceModelId = ? AND partType = ?
          AND issueCode = ?
          AND (? = '' OR cityCode = ? OR cityCode = 'default' OR cityCode = '')
        ORDER BY ${cityOrderSql}, CASE WHEN subtypeId = 0 OR subtypeId IS NULL THEN 0 ELSE 1 END, priceMin ASC
        LIMIT 1
      `).get(companyId, deviceModel.id, part, issueCode, city, city, city);
    }

    function pickBySubtypeId(subtypeId) {
      return db.prepare(`
        SELECT * FROM catalog_prices
        WHERE companyId = ? AND deviceModelId = ? AND partType = ?
          AND subtypeId = ?
          AND (? = '' OR cityCode = ? OR cityCode = 'default' OR cityCode = '')
        ORDER BY ${cityOrderSql}, priceMin ASC
        LIMIT 1
      `).get(companyId, deviceModel.id, part, subtypeId, city, city, city);
    }

    function pickByProblemName(problemName) {
      const p = String(problemName || '').trim();
      if (!p) return null;
      return db.prepare(`
        SELECT *
        FROM catalog_prices
        WHERE companyId = ? AND deviceModelId = ? AND partType = ?
          AND (? = '' OR cityCode = ? OR cityCode = 'default' OR cityCode = '')
          AND (
            issueName = ? OR subtypeName = ?
            OR lower(issueName) = lower(?)
            OR lower(COALESCE(subtypeName,'')) = lower(?)
          )
        ORDER BY
          ${cityOrderSql},
          CASE
            WHEN issueName = ? OR lower(issueName) = lower(?) THEN 0
            WHEN subtypeName = ? OR lower(COALESCE(subtypeName,'')) = lower(?) THEN 1
            ELSE 2
          END,
          priceMin ASC
        LIMIT 1
      `).get(
        companyId,
        deviceModel.id,
        part,
        city,
        city,
        p,
        p,
        p,
        p,
        city,
        p,
        p,
        p,
        p,
      );
    }

    /** CRM labels often differ from price-list names (АКБ vs аккумулятор). */
    function expandIssueAliases(raw) {
      const src = String(raw || '').trim();
      if (!src) return [];
      const lower = src.toLowerCase();
      const out = new Set([src, lower, src.replace(/\s+/g, '_'), lower.replace(/\s+/g, '_')]);

      const groups = [
        {
          test: /акб|аккумулятор|батаре|battery/i,
          names: ['Замена АКБ', 'Замена аккумулятора', 'Замена батареи', 'замена_акб'],
        },
        {
          test: /диспле|экран|display|screen/i,
          names: ['Замена дисплея', 'Замена экрана', 'замена_дисплея'],
        },
        {
          test: /задн.*(стекл|крыш)|задняя крышка|back.?glass/i,
          names: ['Замена заднего стекла', 'Замена задней крышки', 'замена_заднего_стекла'],
        },
        {
          test: /камер/i,
          names: ['Замена камеры', 'Замена основной камеры', 'Замена фронтальной камеры'],
        },
        {
          test: /разъем|разъём|charging|зарядк/i,
          names: ['Замена разъема зарядки', 'Замена разъёма зарядки', 'замена_разъема_зарядки'],
        },
      ];

      for (const g of groups) {
        if (g.test.test(src)) {
          for (const n of g.names) out.add(n);
        }
      }
      return [...out];
    }

    function pickByAnyName(raw) {
      for (const alias of expandIssueAliases(raw)) {
        const hit =
          pickByProblemName(alias) ||
          pickByIssueCode(alias) ||
          pickByIssueCode(String(alias).replace(/\s+/g, '_')) ||
          pickByProblemName(String(alias).replace(/_/g, ' '));
        if (hit) return hit;
      }
      // last resort: keyword overlap inside issueName for this model
      const tokens = String(raw || '')
        .toLowerCase()
        .replace(/[^a-zа-яё0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !['замена', 'ремонт', 'услуги'].includes(t));
      if (!tokens.length) return null;
      const likeParts = tokens.map(() => 'lower(issueName) LIKE ?').join(' AND ');
      const likeParams = tokens.map((t) => `%${t}%`);
      return db.prepare(`
        SELECT * FROM catalog_prices
        WHERE companyId = ? AND deviceModelId = ? AND partType = ?
          AND (? = '' OR cityCode = ? OR cityCode = 'default' OR cityCode = '')
          AND ${likeParts}
        ORDER BY ${cityOrderSql}, priceMin ASC
        LIMIT 1
      `).get(companyId, deviceModel.id, part, city, city, ...likeParams, city);
    }

    let rows = null;
    const pid = Number(problemId);
    if (Number.isFinite(pid) && pid > 0) {
      const crmProblem = db.prepare(
        'SELECT id, name, description FROM common_problems WHERE id = ? AND companyId = ?'
      ).get(pid, companyId);
      const desc = String(crmProblem?.description || '');
      // "site:issue:display" or "[price-import] site:issue:Замена дисплея"
      const issueMatch = desc.match(/site:issue:(.+)$/i);
      const subtypeMatch = desc.match(/site:subtype:(\d+)/i);
      if (issueMatch) {
        const raw = String(issueMatch[1] || '').trim();
        rows = pickByAnyName(raw);
      } else if (subtypeMatch) {
        rows = pickBySubtypeId(Number(subtypeMatch[1]));
      }
      if (!rows && crmProblem?.name) {
        rows = pickByAnyName(crmProblem.name);
      }
    }

    if (!rows && problem) {
      rows = pickByAnyName(problem);
    }

    if (!rows) {
      return res.json({ found: false, reason: 'price_not_found', deviceModelId: deviceModel.id });
    }

    res.json({
      found: true,
      priceMin: Number(rows.priceMin) || 0,
      priceMax: rows.priceMax != null ? Number(rows.priceMax) : null,
      durationMinutes: Number(rows.durationMinutes) || 0,
      issueCode: rows.issueCode,
      issueName: rows.issueName,
      subtypeName: rows.subtypeName || '',
      partType: rows.partType,
      cityCode: rows.cityCode,
      cityName: rows.cityName,
      deviceModelId: deviceModel.id,
    });
  } catch (error) {
    console.error('Ошибка поиска цены каталога:', error);
    res.status(500).json({ error: 'Ошибка поиска цены' });
  }
});

router.get('/stats', (req, res) => {
  try {
    ensureCatalogTable();
    const companyId = req.user.companyId;
    const brands = db.prepare('SELECT COUNT(*) AS c FROM brands WHERE companyId = ?').get(companyId).c;
    const models = db.prepare(`
      SELECT COUNT(*) AS c FROM device_models m
      JOIN brands b ON b.id = m.brandId
      WHERE b.companyId = ?
    `).get(companyId).c;
    const problems = db.prepare('SELECT COUNT(*) AS c FROM common_problems WHERE companyId = ?').get(companyId).c;
    const prices = db.prepare('SELECT COUNT(*) AS c FROM catalog_prices WHERE companyId = ?').get(companyId).c;
    const services = db.prepare('SELECT COUNT(*) AS c FROM services WHERE companyId = ?').get(companyId).c;
    const syncedAt = db.prepare(`
      SELECT MAX(updatedAt) AS syncedAt FROM catalog_prices WHERE companyId = ?
    `).get(companyId).syncedAt;
    res.json({ brands, models, problems, prices, services, syncedAt });
  } catch (error) {
    console.error('Ошибка статистики каталога:', error);
    res.status(500).json({ error: 'Ошибка статистики каталога' });
  }
});

// Каскадные фильтры каталога: тип → бренды → модели → поломки
router.get('/filters', (req, res) => {
  try {
    ensureCatalogTable();
    const companyId = req.user.companyId;
    const deviceType = String(req.query.deviceType || '').trim();
    const brandId = Number(req.query.brandId) || 0;
    const modelId = Number(req.query.modelId) || 0;
    const issueCode = String(req.query.issueCode || '').trim();
    const partType = String(req.query.partType || '').trim();

    const deviceTypes = db.prepare(`
      SELECT DISTINCT m.deviceType AS name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      WHERE cp.companyId = ?
      ORDER BY m.deviceType
    `).all(companyId).map((r) => r.name);

    const brandWhere = ['cp.companyId = ?', 'b.companyId = ?'];
    const brandParams = [companyId, companyId];
    if (deviceType) {
      brandWhere.push('m.deviceType = ?');
      brandParams.push(deviceType);
    }
    const brands = db.prepare(`
      SELECT DISTINCT b.id, b.name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${brandWhere.join(' AND ')}
      ORDER BY b.name
    `).all(...brandParams);

    const modelWhere = ['cp.companyId = ?'];
    const modelParams = [companyId];
    if (deviceType) {
      modelWhere.push('m.deviceType = ?');
      modelParams.push(deviceType);
    }
    if (brandId > 0) {
      modelWhere.push('b.id = ?');
      modelParams.push(brandId);
    }
    const models = db.prepare(`
      SELECT DISTINCT m.id, m.brandId, m.name, m.deviceType, b.name AS brandName
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${modelWhere.join(' AND ')}
      ORDER BY m.name
    `).all(...modelParams);

    const issueWhere = ['cp.companyId = ?'];
    const issueParams = [companyId];
    if (deviceType) {
      issueWhere.push('m.deviceType = ?');
      issueParams.push(deviceType);
    }
    if (brandId > 0) {
      issueWhere.push('b.id = ?');
      issueParams.push(brandId);
    }
    if (modelId > 0) {
      issueWhere.push('m.id = ?');
      issueParams.push(modelId);
    }
    if (issueCode) {
      issueWhere.push('cp.issueCode = ?');
      issueParams.push(issueCode);
    }
    if (partType) {
      issueWhere.push('cp.partType = ?');
      issueParams.push(partType);
    }
    const issues = db.prepare(`
      SELECT DISTINCT cp.issueCode AS code, cp.issueName AS name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${issueWhere.join(' AND ')}
      ORDER BY cp.issueName
    `).all(...issueParams);

    const cities = db.prepare(`
      SELECT DISTINCT cp.cityCode AS code, cp.cityName AS name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${issueWhere.join(' AND ')}
        AND cp.cityCode != ''
      ORDER BY cp.cityName
    `).all(...issueParams);

    res.json({ deviceTypes, brands, models, issues, cities });
  } catch (error) {
    console.error('Ошибка фильтров каталога:', error);
    res.status(500).json({ error: 'Ошибка загрузки фильтров каталога' });
  }
});

// Список цен каталога с сайта (бренд, модель, тип устройства, поломка)
router.get('/prices', (req, res) => {
  try {
    ensureCatalogTable();
    const companyId = req.user.companyId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const deviceType = String(req.query.deviceType || '').trim();
    const brandId = Number(req.query.brandId) || 0;
    const modelId = Number(req.query.modelId) || 0;
    const issueCode = String(req.query.issueCode || '').trim();
    const partType = String(req.query.partType || 'original').trim() || 'original';
    const cityCode = String(req.query.cityCode || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const includeMissing = modelId > 0 && String(req.query.includeMissing || '1') !== '0';

    const syncedAt = db.prepare(`
      SELECT MAX(updatedAt) AS syncedAt FROM catalog_prices WHERE companyId = ?
    `).get(companyId).syncedAt;

    if (includeMissing) {
      const modelInfo = db.prepare(`
        SELECT m.id, m.name, m.deviceType, b.id AS brandId, b.name AS brandName
        FROM device_models m
        JOIN brands b ON b.id = m.brandId
        WHERE m.id = ? AND b.companyId = ?
      `).get(modelId, companyId);

      if (!modelInfo) {
        return res.json({
          items: [],
          total: 0,
          page,
          limit,
          pages: 1,
          syncedAt,
          includeMissing: true,
          pricedCount: 0,
          unpricedCount: 0,
          deviceTypes: [],
          issues: [],
        });
      }

      const resolvedDeviceType = deviceType || modelInfo.deviceType;

      const baseWhere = ['cp.companyId = ?'];
      const baseParams = [companyId];
      if (resolvedDeviceType) {
        baseWhere.push('m.deviceType = ?');
        baseParams.push(resolvedDeviceType);
      }
      if (issueCode) {
        baseWhere.push('cp.issueCode = ?');
        baseParams.push(issueCode);
      }
      if (partType) {
        baseWhere.push('cp.partType = ?');
        baseParams.push(partType);
      }
      if (cityCode) {
        baseWhere.push('cp.cityCode = ?');
        baseParams.push(cityCode);
      }

      const searchWhere = [];
      const searchParams = [];
      if (search) {
        searchWhere.push(`(
          LOWER(all_items.issueName) LIKE ? OR LOWER(COALESCE(all_items.subtypeName, '')) LIKE ?
        )`);
        const q = `%${search}%`;
        searchParams.push(q, q);
      }
      const searchSql = searchWhere.length ? `WHERE ${searchWhere.join(' AND ')}` : '';

      const cityNameRow = cityCode
        ? db.prepare(`
            SELECT cityName FROM catalog_prices
            WHERE companyId = ? AND cityCode = ?
            LIMIT 1
          `).get(companyId, cityCode)
        : null;
      const cityName = cityNameRow?.cityName || '';

      const countRow = db.prepare(`
        SELECT COUNT(*) AS c FROM (
          SELECT DISTINCT cp.issueCode, COALESCE(cp.subtypeId, -1) AS subtypeKey,
                 cp.issueName, cp.subtypeName
          FROM catalog_prices cp
          JOIN device_models m ON m.id = cp.deviceModelId
          JOIN brands b ON b.id = m.brandId
          WHERE ${baseWhere.join(' AND ')}
        ) all_items
        ${searchSql}
      `).get(...baseParams, ...searchParams);

      const total = countRow.c;
      const pricedCount = db.prepare(`
        SELECT COUNT(*) AS c FROM (
          SELECT DISTINCT cp.issueCode, COALESCE(cp.subtypeId, -1) AS subtypeKey
          FROM catalog_prices cp
          JOIN device_models m ON m.id = cp.deviceModelId
          JOIN brands b ON b.id = m.brandId
          WHERE ${baseWhere.join(' AND ')}
        ) all_items
        INNER JOIN catalog_prices priced ON
          priced.companyId = ? AND priced.deviceModelId = ?
          AND priced.issueCode = all_items.issueCode
          AND COALESCE(priced.subtypeId, -1) = all_items.subtypeKey
          AND priced.partType = ? AND priced.cityCode = ?
      `).get(...baseParams, companyId, modelId, partType, cityCode).c;

      const items = db.prepare(`
        SELECT
          priced.id,
          all_items.issueCode,
          all_items.issueName,
          CASE WHEN all_items.subtypeKey = -1 THEN NULL ELSE all_items.subtypeKey END AS subtypeId,
          all_items.subtypeName,
          priced.partType,
          priced.cityCode,
          priced.cityName,
          priced.priceMin,
          priced.priceMax,
          priced.durationMinutes,
          priced.updatedAt,
          CASE WHEN priced.id IS NULL THEN 0 ELSE 1 END AS hasPrice
        FROM (
          SELECT DISTINCT
            cp.issueCode,
            COALESCE(cp.subtypeId, -1) AS subtypeKey,
            cp.issueName,
            cp.subtypeName
          FROM catalog_prices cp
          JOIN device_models m ON m.id = cp.deviceModelId
          JOIN brands b ON b.id = m.brandId
          WHERE ${baseWhere.join(' AND ')}
        ) all_items
        LEFT JOIN catalog_prices priced ON
          priced.companyId = ?
          AND priced.deviceModelId = ?
          AND priced.issueCode = all_items.issueCode
          AND COALESCE(priced.subtypeId, -1) = all_items.subtypeKey
          AND priced.partType = ?
          AND priced.cityCode = ?
        ${searchSql}
        ORDER BY hasPrice ASC, all_items.issueName, all_items.subtypeName
        LIMIT ? OFFSET ?
      `).all(
        ...baseParams,
        companyId,
        modelId,
        partType,
        cityCode,
        ...searchParams,
        limit,
        offset,
      );

      const issueWhere = ['cp.companyId = ?', 'm.id = ?'];
      const issueParams = [companyId, modelId];
      if (issueCode) {
        issueWhere.push('cp.issueCode = ?');
        issueParams.push(issueCode);
      }
      if (partType) {
        issueWhere.push('cp.partType = ?');
        issueParams.push(partType);
      }
      if (cityCode) {
        issueWhere.push('cp.cityCode = ?');
        issueParams.push(cityCode);
      }
      const issues = db.prepare(`
        SELECT DISTINCT cp.issueCode AS code, cp.issueName AS name
        FROM catalog_prices cp
        JOIN device_models m ON m.id = cp.deviceModelId
        WHERE ${issueWhere.join(' AND ')}
        ORDER BY cp.issueName
      `).all(...issueParams);

      return res.json({
        items: items.map((row) => ({
          id: row.id,
          issueCode: row.issueCode,
          issueName: row.issueName,
          subtypeId: row.subtypeId,
          subtypeName: row.subtypeName,
          partType: row.partType || partType,
          cityCode: row.cityCode || cityCode,
          cityName: row.cityName || cityName,
          priceMin: row.priceMin != null ? Number(row.priceMin) : null,
          priceMax: row.priceMax != null ? Number(row.priceMax) : null,
          durationMinutes: row.durationMinutes != null ? Number(row.durationMinutes) : null,
          updatedAt: row.updatedAt,
          modelId: modelInfo.id,
          modelName: modelInfo.name,
          deviceType: modelInfo.deviceType,
          brandId: modelInfo.brandId,
          brandName: modelInfo.brandName,
          hasPrice: row.hasPrice === 1,
        })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
        syncedAt,
        includeMissing: true,
        pricedCount,
        unpricedCount: total - pricedCount,
        deviceTypes: [modelInfo.deviceType],
        issues,
      });
    }

    const where = ['cp.companyId = ?'];
    const params = [companyId];

    if (deviceType) {
      where.push('m.deviceType = ?');
      params.push(deviceType);
    }
    if (brandId > 0) {
      where.push('b.id = ?');
      params.push(brandId);
    }
    if (modelId > 0) {
      where.push('m.id = ?');
      params.push(modelId);
    }
    if (issueCode) {
      where.push('cp.issueCode = ?');
      params.push(issueCode);
    }
    if (partType) {
      where.push('cp.partType = ?');
      params.push(partType);
    }
    if (cityCode) {
      where.push('cp.cityCode = ?');
      params.push(cityCode);
    }
    if (search) {
      where.push(`(
        LOWER(b.name) LIKE ? OR LOWER(m.name) LIKE ? OR
        LOWER(cp.issueName) LIKE ? OR LOWER(cp.subtypeName) LIKE ?
      )`);
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    const whereSql = where.join(' AND ');

    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${whereSql}
    `).get(...params).c;

    const items = db.prepare(`
      SELECT
        cp.id,
        cp.issueCode,
        cp.issueName,
        cp.subtypeId,
        cp.subtypeName,
        cp.partType,
        cp.cityCode,
        cp.cityName,
        cp.priceMin,
        cp.priceMax,
        cp.durationMinutes,
        cp.updatedAt,
        m.id AS modelId,
        m.name AS modelName,
        m.deviceType,
        b.id AS brandId,
        b.name AS brandName
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${whereSql}
      ORDER BY m.deviceType, b.name, m.name, cp.issueName, cp.subtypeName, cp.partType
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const deviceTypes = db.prepare(`
      SELECT DISTINCT m.deviceType AS name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE cp.companyId = ?
      ORDER BY m.deviceType
    `).all(companyId).map((r) => r.name);

    const issues = db.prepare(`
      SELECT DISTINCT cp.issueCode AS code, cp.issueName AS name
      FROM catalog_prices cp
      JOIN device_models m ON m.id = cp.deviceModelId
      JOIN brands b ON b.id = m.brandId
      WHERE ${whereSql}
      ORDER BY cp.issueName
    `).all(...params);

    res.json({
      items: items.map((row) => ({
        ...row,
        priceMin: Number(row.priceMin) || 0,
        priceMax: row.priceMax != null ? Number(row.priceMax) : null,
        durationMinutes: Number(row.durationMinutes) || 0,
        hasPrice: true,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      syncedAt,
      includeMissing: false,
      deviceTypes,
      issues,
    });
  } catch (error) {
    console.error('Ошибка списка цен каталога:', error);
    res.status(500).json({ error: 'Ошибка загрузки каталога цен' });
  }
});

module.exports = router;
