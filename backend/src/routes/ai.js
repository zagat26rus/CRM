const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { getCompanySettings, mergeCompanySettings } = require('../utils/companySettings');
const { chatJson, resolveLlmConfig } = require('../utils/llm');
const axios = require('axios');
const {
  searchTaggsm,
  searchGreenspark,
  searchDivizion,
  searchStavdisplay,
  searchLiberti,
  searchSiriust,
  parsePartsQuery,
} = require('./supplierConnectors');

router.use(requireAuth);

const DEFAULT_AI = {
  // Stavropol-focused set + TAGGSM as national reference
  enabledSuppliers: ['divizion', 'stavdisplay', 'greenspark', 'liberti', 'siriust', 'taggsm'],
  cacheTtlMinutes: 30,
  llm: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
  },
  greensparkCookie: '',
  libertiCookie: '',
  siriustCookie: '',
};

function ensureAiTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_parts_search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId INTEGER NOT NULL,
      cacheKey TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      UNIQUE(companyId, cacheKey)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_parts_cache_exp ON ai_parts_search_cache(expiresAt);
  `);
}

function getAiSettings(companyId) {
  const s = getCompanySettings(db, companyId);
  const raw = s.aiPartsSearch && typeof s.aiPartsSearch === 'object' ? s.aiPartsSearch : {};
  const storedLlm = {
    provider: String(raw.llm?.provider || DEFAULT_AI.llm.provider),
    baseUrl: String(raw.llm?.baseUrl || DEFAULT_AI.llm.baseUrl),
    model: String(raw.llm?.model || DEFAULT_AI.llm.model),
    apiKey: String(raw.llm?.apiKey || ''),
  };
  const llm = resolveLlmConfig(storedLlm);
  return {
    enabledSuppliers: (() => {
      const saved = Array.isArray(raw.enabledSuppliers) ? raw.enabledSuppliers.map(String) : [];
      if (!saved.length) return [...DEFAULT_AI.enabledSuppliers];
      // ensure Stavropol suppliers are present after update (once)
      if (!raw.stavropolSuppliersV2) {
        const must = ['divizion', 'stavdisplay', 'greenspark', 'liberti', 'siriust'];
        const set = new Set(saved);
        for (const id of must) set.add(id);
        return [...set];
      }
      return saved;
    })(),
    cacheTtlMinutes: Math.min(Math.max(Number(raw.cacheTtlMinutes) || DEFAULT_AI.cacheTtlMinutes, 5), 240),
    llm,
    greensparkCookie: String(raw.greensparkCookie || ''),
    libertiCookie: String(raw.libertiCookie || ''),
    siriustCookie: String(raw.siriustCookie || ''),
  };
}

function publicAiSettings(ai) {
  return {
    enabledSuppliers: ai.enabledSuppliers,
    cacheTtlMinutes: ai.cacheTtlMinutes,
    cityFocus: 'Ставрополь',
    llm: {
      provider: ai.llm.provider,
      baseUrl: ai.llm.baseUrl,
      model: ai.llm.model,
      apiKeySet: Boolean(ai.llm.apiKey),
      fromEnv: Boolean(ai.llm.fromEnv),
    },
    greensparkCookieSet: Boolean(ai.greensparkCookie),
    libertiCookieSet: Boolean(ai.libertiCookie),
    siriustCookieSet: Boolean(ai.siriustCookie),
  };
}

/** Offline diagnose when cloud LLM key is missing — so corner chat always answers. */
function offlineDiagnose(symptom, catalog = []) {
  const t = String(symptom || '').toLowerCase();
  const rules = [
    {
      re: /не\s*включа|не\s*запуск|мертв|brick|нет\s*реакц|чёрн(ый|ый)\s*экран.*кнопк|кнопк.*не\s*реаг/i,
      name: 'Не включается',
      reason: 'Нет реакции на питание — проверяют АКБ, шлейф питания, контроллер.',
      partHint: 'АКБ / шлейф питания',
      confidence: 78,
    },
    {
      re: /батаре|акб|аккумулятор|разряд|держит\s*заряд|быстро\s*садит|греет.*заряд|не\s*заряд/i,
      name: 'Замена аккумулятора',
      reason: 'Симптомы по питанию/заряду чаще всего связаны с износом АКБ или разъёмом.',
      partHint: 'АКБ',
      confidence: 82,
    },
    {
      re: /экран|дисплей|тач|сенсор|полос|пятн|бит|битые\s*пиксе|нет\s*изображен|белый\s*экран|чёрн(ый|ый)\s*экран|разбит/i,
      name: 'Замена дисплея',
      reason: 'Проблемы изображения/тача после удара или «само» — чаще модуль дисплея.',
      partHint: 'Дисплейный модуль',
      confidence: 85,
    },
    {
      re: /камер|фото|видео.*не\s*работ|туман|пятн.*камер/i,
      name: 'Замена камеры',
      reason: 'Нет изображения с камеры или артефакты — модуль камеры / шлейф.',
      partHint: 'Камера',
      confidence: 74,
    },
    {
      re: /звук|динамик|микрофон|не\s*слыш|тише|хрип|разговорн/i,
      name: 'Замена динамика',
      reason: 'Проблемы звука на разговоре/мультимедиа — динамик или микрофон.',
      partHint: 'Динамик / микрофон',
      confidence: 72,
    },
    {
      re: /кнопк|громкост|блокировк|power|вкл.*кнопк|не\s*нажима/i,
      name: 'Замена кнопки',
      reason: 'Механика кнопки или шлейф кнопок.',
      partHint: 'Шлейф кнопок',
      confidence: 70,
    },
    {
      re: /зарядк|type.?c|lightning|разъ[её]м|не\s*видит\s*кабель|шатает.*шнур/i,
      name: 'Замена разъёма зарядки',
      reason: 'Плохой контакт зарядки / только под углом — разъём.',
      partHint: 'Разъём зарядки',
      confidence: 80,
    },
    {
      re: /вода|утоп|попал.*влаг|коррози|после\s*душ/i,
      name: 'Чистка после влаги',
      reason: 'После влаги нужна диагностика и ультразвуковая чистка до замены плат.',
      partHint: 'Чистка / диагностика',
      confidence: 76,
    },
    {
      re: /перезагруз|reboot|вылет|глючит|лагает|тормозит|нагрев|греет/i,
      name: 'Программная диагностика',
      reason: 'Возможен софт, перегрев или начало аппаратной неисправности — сначала диагностика.',
      partHint: 'Диагностика',
      confidence: 65,
    },
    {
      re: /сеть|sim|антенн|не\s*ловит|wifi|wi-fi|bluetooth|gps/i,
      name: 'Проблема связи',
      reason: 'Связь/Wi‑Fi — антенный шлейф или модемная часть.',
      partHint: 'Антенный шлейф',
      confidence: 68,
    },
  ];

  const hits = [];
  for (const rule of rules) {
    if (rule.re.test(t)) hits.push(rule);
  }
  if (!hits.length) {
    hits.push({
      name: 'Диагностика',
      reason: 'По описанию нужен осмотр: уточните модель, что уже пробовали и после чего началось.',
      partHint: '',
      confidence: 50,
    });
  }

  // Prefer catalog names when close match
  const suggestions = hits.slice(0, 5).map((h) => {
    const cat = (catalog || []).find(
      (c) =>
        String(c.name || '').toLowerCase().includes(h.name.toLowerCase().slice(0, 8)) ||
        h.name.toLowerCase().includes(String(c.name || '').toLowerCase().slice(0, 8)),
    );
    return {
      name: cat?.name || h.name,
      reason: h.reason,
      confidence: h.confidence,
      partHint: h.partHint || '',
    };
  });

  return {
    reply:
      'Пока нет облачного ключа ИИ — отвечаю по типичным симптомам сервиса. Для более точной диагностики добавьте бесплатный ключ Gemini или Groq в Настройки → ИИ / поставщики.\n\n' +
      suggestions.map((s, i) => `${i + 1}. ${s.name}: ${s.reason}`).join('\n'),
    suggestions,
    mode: 'offline',
  };
}

function lookupRetailPrice(companyId, brand, model, problemName) {
  if (!brand || !model || !problemName) return null;
  const deviceModel = db.prepare(`
    SELECT m.id
    FROM device_models m
    JOIN brands b ON b.id = m.brandId
    WHERE b.companyId = ? AND lower(b.name) = lower(?) AND lower(m.name) = lower(?)
    LIMIT 1
  `).get(companyId, brand, model);
  if (!deviceModel) return null;

  const row = db.prepare(`
    SELECT issueName, partType, priceMin, cityCode
    FROM catalog_prices
    WHERE companyId = ? AND deviceModelId = ?
      AND (cityCode = 'default' OR cityCode = '' OR cityCode IS NULL)
      AND (
        lower(issueName) = lower(?)
        OR lower(issueName) LIKE lower(?)
        OR issueCode = replace(lower(?), ' ', '_')
      )
    ORDER BY
      CASE WHEN partType = 'original' THEN 0 ELSE 1 END,
      CASE WHEN cityCode = 'default' THEN 0 ELSE 1 END,
      priceMin ASC
    LIMIT 1
  `).get(companyId, deviceModel.id, problemName, `%${problemName}%`, problemName);

  if (!row) return null;
  return {
    issueName: row.issueName,
    partType: row.partType,
    priceMin: Number(row.priceMin) || 0,
    cityCode: row.cityCode,
  };
}

function cacheGet(companyId, key) {
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT payloadJson FROM ai_parts_search_cache
    WHERE companyId = ? AND cacheKey = ? AND expiresAt > ?
  `).get(companyId, key, now);
  if (!row) return null;
  try {
    return JSON.parse(row.payloadJson);
  } catch {
    return null;
  }
}

function luhnOk(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function companyProblemCatalog(companyId, deviceType) {
  try {
    let sql = 'SELECT name, deviceType, defaultPrice FROM common_problems WHERE companyId = ?';
    const params = [companyId];
    if (deviceType) {
      sql += ' AND (deviceType = ? OR deviceType IS NULL OR deviceType = "")';
      params.push(deviceType);
    }
    sql += ' ORDER BY name LIMIT 80';
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

async function advisePartsSearch(llm, { query, parsed, offers, retail, priceInsight }) {
  if (!llm?.apiKey) return null;
  const top = (offers || []).slice(0, 12).map((o, i) => ({
    i,
    supplier: o.supplier,
    city: o.city || '',
    title: o.title,
    price: o.price,
    inStock: o.inStock,
  }));
  try {
    const json = await chatJson(llm, {
      temperature: 0.25,
      messages: [
        {
          role: 'system',
          content:
            'Ты мастер приёмки сервисного центра в Ставрополе. По запросу запчасти и офферам поставщиков дай практичный совет закупщику. Ответ строго JSON: {"advice":"2-5 предложений на русском","pickIndex":null или номер из списка,"risks":"кратко если есть"}',
        },
        {
          role: 'user',
          content: JSON.stringify({
            query,
            parsed,
            retail,
            priceInsight,
            offers: top,
          }),
        },
      ],
    });
    const pickIndex = Number.isInteger(json.pickIndex) ? json.pickIndex : null;
    return {
      advice: String(json.advice || '').trim(),
      pickIndex,
      risks: String(json.risks || '').trim(),
    };
  } catch (e) {
    console.error('parts advice llm', e.message || e);
    return null;
  }
}

async function runPartsSearch(companyId, query, { skipCache = false } = {}) {
  const ai = getAiSettings(companyId);
  const cacheKey = crypto
    .createHash('sha1')
    .update(JSON.stringify({ q: query.toLowerCase(), suppliers: ai.enabledSuppliers, v: 2 }))
    .digest('hex');

  if (!skipCache) {
    const cached = cacheGet(companyId, cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const parsed = await parsePartsQuery(query, ai.llm);
  const searchQuery = parsed.searchQuery || query;

  const common = {
    query: searchQuery,
    brand: parsed.brand,
    model: parsed.model,
    partKind: parsed.partKind,
    partLabel: parsed.partLabel,
    limit: 12,
  };
  const tasks = [];
  const pushTask = (enabledKey, fn, failSupplier) => {
    if (!ai.enabledSuppliers.includes(enabledKey)) return;
    tasks.push(
      fn().catch((e) => ({
        supplier: failSupplier,
        ok: false,
        offers: [],
        error: e.message || `${enabledKey}_failed`,
      })),
    );
  };

  pushTask('taggsm', () => searchTaggsm(common), 'TAGGSM');
  pushTask(
    'greenspark',
    () => searchGreenspark({ ...common, cookie: ai.greensparkCookie }),
    'GreenSpark',
  );
  pushTask('divizion', () => searchDivizion(common), 'Divizion');
  pushTask('stavdisplay', () => searchStavdisplay(common), 'StavDisplay');
  pushTask(
    'liberti',
    () => searchLiberti({ ...common, cookie: ai.libertiCookie }),
    'Liberti',
  );
  pushTask(
    'siriust',
    () => searchSiriust({ ...common, cookie: ai.siriustCookie }),
    'Siriust',
  );

  const supplierResults = await Promise.all(tasks);
  const offers = supplierResults.flatMap((r) => r.offers || []);
  offers.sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));

  const retail = lookupRetailPrice(companyId, parsed.brand, parsed.model, parsed.problemName);

  const summaryLines = [];
  summaryLines.push(`Запрос: ${query}`);
  if (parsed.brand || parsed.model || parsed.partLabel) {
    summaryLines.push(
      `Распознано: ${[parsed.partLabel, parsed.brand, parsed.model].filter(Boolean).join(' · ') || '—'}`,
    );
  }
  for (const r of supplierResults) {
    if (!r.ok) {
      summaryLines.push(
        `${r.supplier}: нет данных${r.hint ? ` (${r.hint})` : r.error ? ` (${r.error})` : ''}`,
      );
      continue;
    }
    const best = (r.offers || [])[0];
    if (best) {
      const city = best.city || r.city || '';
      summaryLines.push(
        `${r.supplier}${city ? ` (${city})` : ''}: от ${best.price != null ? `${best.price} ₽` : '—'} · ${best.title}`,
      );
    } else {
      summaryLines.push(`${r.supplier}${r.city ? ` (${r.city})` : ''}: совпадений не найдено`);
    }
  }
  if (retail?.priceMin) {
    summaryLines.push(`Ваш ориентир клиенту (${retail.issueName}, ${retail.partType}): ${retail.priceMin} ₽`);
  }

  const priced = offers.filter((o) => o.price != null && Number.isFinite(Number(o.price)));
  const bestBuy = priced.length
    ? priced.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    : null;
  const inStockPriced = priced.filter((o) => o.inStock === true);
  const bestInStock = inStockPriced.length
    ? inStockPriced.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    : null;

  let priceInsight = null;
  if (retail?.priceMin && bestBuy) {
    const buy = Number(bestBuy.price);
    const retailMin = Number(retail.priceMin);
    const margin = retailMin - buy;
    const marginPct = retailMin > 0 ? Math.round((margin / retailMin) * 100) : null;
    let verdict = 'ok';
    let hint = `Закуп от ${buy} ₽ · прайс клиенту ${retailMin} ₽ · запас ~${margin} ₽`;
    if (margin < 0) {
      verdict = 'below_cost';
      hint = `Внимание: прайс клиенту (${retailMin} ₽) ниже рынка закупа (от ${buy} ₽ у ${bestBuy.supplier})`;
    } else if (marginPct != null && marginPct < 25) {
      verdict = 'thin';
      hint = `Узкая маржа ~${marginPct}%: закуп от ${buy} ₽, прайс ${retailMin} ₽`;
    } else if (marginPct != null && marginPct >= 40) {
      verdict = 'healthy';
      hint = `Хороший запас ~${marginPct}%: закуп от ${buy} ₽ → клиенту ${retailMin} ₽`;
    }
    priceInsight = {
      retailMin,
      bestBuyPrice: buy,
      bestBuySupplier: bestBuy.supplier,
      bestInStockPrice: bestInStock ? Number(bestInStock.price) : null,
      bestInStockSupplier: bestInStock?.supplier || null,
      margin,
      marginPct,
      verdict,
      hint,
    };
    summaryLines.push(hint);
  } else if (bestBuy && !retail?.priceMin) {
    priceInsight = {
      retailMin: null,
      bestBuyPrice: Number(bestBuy.price),
      bestBuySupplier: bestBuy.supplier,
      bestInStockPrice: bestInStock ? Number(bestInStock.price) : null,
      bestInStockSupplier: bestInStock?.supplier || null,
      margin: null,
      marginPct: null,
      verdict: 'no_retail',
      hint: `Рынок закупа от ${bestBuy.price} ₽ (${bestBuy.supplier}). Позиции нет в вашем прайсе — добавьте цену клиенту.`,
    };
    summaryLines.push(priceInsight.hint);
  }

  const agent = await advisePartsSearch(ai.llm, { query, parsed, offers, retail, priceInsight });
  if (agent?.advice) summaryLines.push(agent.advice);

  const payload = {
    query,
    parsed,
    suppliers: supplierResults.map((r) => ({
      supplier: r.supplier,
      ok: r.ok,
      error: r.error || null,
      hint: r.hint || null,
      offerCount: (r.offers || []).length,
      source: r.source || null,
    })),
    offers,
    retail,
    priceInsight,
    agent,
    summary: summaryLines.join('\n'),
    cached: false,
    fetchedAt: new Date().toISOString(),
  };

  cacheSet(companyId, cacheKey, payload, ai.cacheTtlMinutes);
  return payload;
}

async function fetchImeiPublic(imei) {
  const urls = [
    `https://imeidb.xyz/api/imei/${encodeURIComponent(imei)}`,
    `https://alpha.imei.info/api/?imei=${encodeURIComponent(imei)}&format=json`,
  ];
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        timeout: 8000,
        headers: { Accept: 'application/json', 'User-Agent': 'FixNetCRM/1.0' },
        validateStatus: () => true,
      });
      if (res.status >= 400 || !res.data || typeof res.data !== 'object') continue;
      const d = res.data;
      const brand = d.brand || d.manufacturer || d.make || d.vendor || '';
      const model = d.model || d.name || d.device || d.modelName || '';
      if (!brand && !model) continue;
      return {
        source: url,
        brand: String(brand).trim(),
        model: String(model).trim(),
        color: String(d.color || d.colour || '').trim(),
        storage: String(d.storage || d.memory || d.capacity || d.ram || '').trim(),
        deviceType: String(d.deviceType || d.type || '').trim(),
        raw: d,
      };
    } catch {
      /* next source */
    }
  }
  return null;
}

function cacheSet(companyId, key, payload, ttlMinutes) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  db.prepare(`
    INSERT INTO ai_parts_search_cache (companyId, cacheKey, payloadJson, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(companyId, cacheKey) DO UPDATE SET
      payloadJson = excluded.payloadJson,
      createdAt = excluded.createdAt,
      expiresAt = excluded.expiresAt
  `).run(companyId, key, JSON.stringify(payload), now.toISOString(), expires.toISOString());
}

router.get('/parts-search/settings', (req, res) => {
  try {
    ensureAiTables();
    res.json(publicAiSettings(getAiSettings(req.user.companyId)));
  } catch (e) {
    console.error('ai settings get', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки ИИ' });
  }
});

router.get('/status', (req, res) => {
  try {
    const ai = getAiSettings(req.user.companyId);
    res.json({
      ready: Boolean(ai.llm?.apiKey),
      mode: ai.llm?.apiKey ? (ai.llm.fromEnv ? 'env' : 'settings') : 'offline',
      provider: ai.llm?.provider || null,
      model: ai.llm?.model || null,
      hint: ai.llm?.apiKey
        ? null
        : 'Добавьте бесплатный ключ Gemini (aistudio.google.com) или Groq (console.groq.com) в Настройки → ИИ / поставщики',
    });
  } catch (e) {
    res.status(500).json({ error: 'status_failed' });
  }
});

router.put('/parts-search/settings', requireRole(['owner', 'admin']), (req, res) => {
  try {
    ensureAiTables();
    const body = req.body || {};
    const current = getAiSettings(req.user.companyId);
    const next = {
      enabledSuppliers: Array.isArray(body.enabledSuppliers)
        ? body.enabledSuppliers.map(String)
        : current.enabledSuppliers,
      cacheTtlMinutes: body.cacheTtlMinutes != null
        ? Math.min(Math.max(Number(body.cacheTtlMinutes) || 30, 5), 240)
        : current.cacheTtlMinutes,
      llm: {
        provider: String(body.llm?.provider || current.llm.provider),
        baseUrl: String(body.llm?.baseUrl || current.llm.baseUrl),
        model: String(body.llm?.model || current.llm.model),
        apiKey:
          body.llm?.apiKey !== undefined && String(body.llm.apiKey).trim() !== ''
            ? String(body.llm.apiKey).trim()
            : body.llm?.clearApiKey
              ? ''
              : current.llm.apiKey,
      },
      greensparkCookie:
        body.greensparkCookie !== undefined
          ? String(body.greensparkCookie || '')
          : current.greensparkCookie,
      libertiCookie:
        body.libertiCookie !== undefined ? String(body.libertiCookie || '') : current.libertiCookie,
      siriustCookie:
        body.siriustCookie !== undefined ? String(body.siriustCookie || '') : current.siriustCookie,
      stavropolSuppliersV2: true,
    };
    mergeCompanySettings(db, req.user.companyId, { aiPartsSearch: next });
    res.json(publicAiSettings(getAiSettings(req.user.companyId)));
  } catch (e) {
    console.error('ai settings put', e);
    res.status(500).json({ error: 'Не удалось сохранить настройки ИИ' });
  }
});

router.post('/parts-search', async (req, res) => {
  try {
    ensureAiTables();
    const query = String(req.body?.query || '').trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Введите запрос, например: аккумулятор iPhone X' });
    }
    const payload = await runPartsSearch(req.user.companyId, query, {
      skipCache: Boolean(req.body?.skipCache),
    });
    res.json(payload);
  } catch (e) {
    console.error('ai parts-search', e);
    res.status(500).json({ error: 'Ошибка поиска у поставщиков' });
  }
});

/** Conversational parts agent: LLM + live supplier search. */
router.post('/parts-agent', async (req, res) => {
  try {
    ensureAiTables();
    const companyId = req.user.companyId;
    const ai = getAiSettings(companyId);
    if (!ai.llm?.apiKey) {
      return res.status(400).json({
        error: 'Сначала укажите ключ ИИ в Настройки → ИИ / поставщики',
        code: 'no_api_key',
      });
    }
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...history].reverse().find((m) => m && m.role === 'user');
    const query = String(req.body?.query || lastUser?.content || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ error: 'Опишите запчасть и модель' });
    }

    const wantSearch = req.body?.search !== false;
    const search = wantSearch
      ? await runPartsSearch(companyId, query, { skipCache: Boolean(req.body?.skipCache) })
      : null;

    const compactOffers = (search?.offers || []).slice(0, 10).map((o, i) => ({
      i,
      supplier: o.supplier,
      title: o.title,
      price: o.price,
      inStock: o.inStock,
      city: o.city || '',
    }));

    const json = await chatJson(ai.llm, {
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            'Ты ИИ-агент закупа сервисного центра FixNet (Ставрополь). Отвечай мастеру по-русски, коротко и по делу. Если клиент описывает неисправность — назови вероятную запчасть и что искать у поставщиков. Если есть офферы — сравни 2-3 лучших (цена, наличие, риск копии). Строго JSON: {"reply":"текст","followup":"уточняющий вопрос или пусто","searchQuery":"что искать дальше или пусто"}',
        },
        ...history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
          .slice(-8)
          .map((m) => ({
            role: m.role,
            content: String(m.content || '').slice(0, 2000),
          })),
        {
          role: 'user',
          content: JSON.stringify({
            lastQuery: query,
            parsed: search?.parsed || null,
            priceInsight: search?.priceInsight || null,
            retail: search?.retail || null,
            offers: compactOffers,
          }),
        },
      ],
    });

    res.json({
      reply: String(json.reply || search?.agent?.advice || search?.summary || 'Готово'),
      followup: String(json.followup || ''),
      searchQuery: String(json.searchQuery || ''),
      search,
    });
  } catch (e) {
    console.error('ai parts-agent', e);
    const msg = e.code === 'no_api_key' ? 'Нет ключа ИИ' : e.message || 'Ошибка агента';
    res.status(500).json({ error: msg });
  }
});

/** Diagnose malfunction → CRM issue options (real LLM, with offline fallback). */
router.post('/diagnose', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const ai = getAiSettings(companyId);
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const symptom = String(req.body?.text || history.filter((m) => m?.role === 'user').pop()?.content || '').trim();
    if (symptom.length < 4) {
      return res.status(400).json({ error: 'Опишите неисправность своими словами' });
    }
    const device = {
      brand: String(req.body?.brand || '').trim(),
      model: String(req.body?.model || '').trim(),
      deviceType: String(req.body?.deviceType || 'Смартфон').trim(),
    };
    const catalog = companyProblemCatalog(companyId, device.deviceType);

    if (!ai.llm?.apiKey) {
      return res.json(offlineDiagnose(symptom, catalog));
    }

    try {
      const json = await chatJson(ai.llm, {
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: `Ты инженер-диагност сервисного центра. Клиент/мастер описывает симптомы своими словами. Ты НЕ подбираешь фразы из списка слепо: рассуждаешь по физике неисправности, затем предлагаешь 2–5 вариантов поломок для заявки.
Предпочитай названия из каталога сервиса, если они точно подходят; иначе дай своё точное название.
Строго JSON:
{"reply":"объяснение 2-6 предложений","suggestions":[{"name":"название поломки","reason":"почему","confidence":0-100,"partHint":"какая запчасть"}]}`,
          },
          ...history
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
            .slice(-8)
            .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })),
          {
            role: 'user',
            content: JSON.stringify({
              symptom,
              device,
              catalog: catalog.map((p) => p.name),
            }),
          },
        ],
      });

      const suggestions = Array.isArray(json.suggestions)
        ? json.suggestions
            .slice(0, 6)
            .map((s) => ({
              name: String(s.name || '').trim(),
              reason: String(s.reason || '').trim(),
              confidence: Math.max(0, Math.min(100, Number(s.confidence) || 0)),
              partHint: String(s.partHint || '').trim(),
            }))
            .filter((s) => s.name)
        : [];

      return res.json({
        reply: String(json.reply || '').trim() || 'Нужно чуть больше деталей.',
        suggestions,
        mode: 'llm',
      });
    } catch (llmErr) {
      console.error('ai diagnose llm fallback', llmErr);
      const msg = String(llmErr.message || '');
      const offline = offlineDiagnose(symptom, catalog);
      const groqBlocked = /groq/i.test(String(ai.llm?.baseUrl || ai.llm?.provider || '')) && /403|Forbidden|1010/i.test(msg);
      const hint = groqBlocked
        ? 'Groq с этого сервера отвечает 403 (блок Cloudflare/регион). Переключитесь на бесплатный Gemini в Настройки → ИИ / поставщики. '
        : `Облачный ИИ временно недоступен (${msg.slice(0, 80)}). `;
      return res.json({
        ...offline,
        reply: hint + offline.reply,
      });
    }
  } catch (e) {
    console.error('ai diagnose', e);
    res.status(500).json({ error: e.message || 'Ошибка диагностики' });
  }
});

/** IMEI → model / color / storage. Public TAC + LLM. */
router.post('/imei-lookup', async (req, res) => {
  try {
    const digits = String(req.body?.imei || '').replace(/\D/g, '');
    if (digits.length < 14 || digits.length > 16) {
      return res.status(400).json({ error: 'IMEI — 15 цифр' });
    }
    if (digits.length === 15 && !luhnOk(digits)) {
      return res.status(400).json({ error: 'IMEI не проходит проверку (опечатка?)', code: 'luhn' });
    }
    const tac = digits.slice(0, 8);
    const publicHit = await fetchImeiPublic(digits);
    const ai = getAiSettings(req.user.companyId);

    let llmHit = null;
    if (ai.llm?.apiKey) {
      try {
        llmHit = await chatJson(ai.llm, {
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content:
                'По IMEI/TAC определи устройство. TAC (первые 8 цифр) кодирует модель. Цвет и объём памяти по публичному IMEI часто неизвестны — тогда оставь пустыми, не выдумывай. JSON: {"brand":"","model":"","color":"","storage":"","deviceType":"Смартфон|Планшет|Ноутбук|Другое","confidence":0-100,"notes":"кратко"}',
            },
            {
              role: 'user',
              content: JSON.stringify({
                imei: digits,
                tac,
                publicLookup: publicHit
                  ? {
                      brand: publicHit.brand,
                      model: publicHit.model,
                      color: publicHit.color,
                      storage: publicHit.storage,
                      deviceType: publicHit.deviceType,
                    }
                  : null,
              }),
            },
          ],
        });
      } catch (e) {
        console.error('imei llm', e.message || e);
      }
    }

    const brand = String(llmHit?.brand || publicHit?.brand || '').trim();
    const model = String(llmHit?.model || publicHit?.model || '').trim();
    if (!brand && !model) {
      return res.status(404).json({
        error: 'Не удалось определить модель по IMEI. Проверьте цифры или выберите вручную.',
        tac,
      });
    }

    res.json({
      imei: digits,
      tac,
      brand,
      model,
      color: String(llmHit?.color || publicHit?.color || '').trim(),
      storage: String(llmHit?.storage || publicHit?.storage || '').trim(),
      deviceType: String(llmHit?.deviceType || publicHit?.deviceType || 'Смартфон').trim(),
      confidence: Number(llmHit?.confidence) || (publicHit ? 70 : 40),
      notes: String(llmHit?.notes || '').trim(),
      via: llmHit ? 'llm' : 'public',
    });
  } catch (e) {
    console.error('ai imei-lookup', e);
    res.status(500).json({ error: e.message || 'Ошибка поиска по IMEI' });
  }
});

module.exports = router;
