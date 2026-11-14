/**
 * TAGGSM public catalog connector (OpenCart podbor + search fallback).
 * Model IDs are refreshed from the live podbor page — hardcoded map is only a seed.
 */
const axios = require('axios');
const {
  normalizeModelKey,
  filterRelevant,
  partMatches,
  modelMatches,
  taggsmCategoryPath,
} = require('./relevance');

const BASE = 'https://taggsm.ru';
const APPLE_FABRICATOR_ID = 3;

/** Seed map (may lag). Live options from podbor override these. */
const APPLE_MODEL_IDS = {
  'iphone x': 288,
  'iphone xr': 289,
  'iphone xs': 290,
  'iphone xs max': 291,
  'iphone 11': 292,
  'iphone 11 pro': 293,
  'iphone 11 pro max': 294,
  'iphone 12': 3673,
  'iphone 12 mini': 3675,
  'iphone 12 pro': 3674,
  'iphone 12 pro max': 3676,
  'iphone 13': 5186,
  'iphone 13 mini': 5189,
  'iphone 13 pro': 5187,
  'iphone 13 pro max': 5188,
  'iphone 14': 5560,
  'iphone 14 plus': 5562,
  'iphone 14 pro': 5563,
  'iphone 14 pro max': 5561,
  'iphone 15': 5954,
  'iphone 15 plus': 5955,
  'iphone 15 pro': 5956,
  'iphone 15 pro max': 5957,
  'iphone 16': 6278,
  'iphone 16 plus': 6279,
  'iphone 16 pro': 6280,
  'iphone 16 pro max': 6282,
  'iphone 16e': 6577,
  'iphone 17': 6578,
  'iphone 17 air': 6581,
  'iphone 17 pro': 6579,
  'iphone 17 pro max': 6580,
  'iphone se (2016)': 283,
  'iphone se (2020)': 295,
  'iphone se (2022)': 5960,
};


function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function absUrl(href) {
  const h = decodeEntities(href).trim();
  if (!h) return BASE;
  if (h.startsWith('http')) return h;
  return `${BASE}/${h.replace(/^\//, '')}`;
}

function parsePrice(block) {
  const nums = [];
  const re = />\s*([\d\s\u00a0]{2,12})\s*(?:р\.|руб\.?|₽)/gi;
  let m;
  while ((m = re.exec(block))) {
    const d = m[1].replace(/\D/g, '');
    if (d) nums.push(Number(d));
  }
  if (!nums.length) return null;
  return Math.min(...nums);
}

function parseStock(block) {
  const text = String(block || '');
  // One product card lists many warehouses — any "есть в наличии" means available.
  const yes = (text.match(/есть в наличии/gi) || []).length;
  if (yes > 0) return true;
  // Green "наличие" = in transit / other store (still sellable on site)
  if (/color:\s*#2B7E25[^>]*>\s*наличие/i.test(text)) return true;
  const no = (text.match(/нет в наличии/gi) || []).length;
  if (no > 0) return false;
  if (/(?<!нет\s)в наличии/i.test(text)) return true;
  return null;
}

function parseProductLayouts(html) {
  const parts = String(html || '').split(/<div class="product-layout/);
  const offers = [];
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const m = block.match(/<a href="([^"]*product_id=(\d+)[^"]*)"[^>]*>\s*([^<]{3,220})\s*<\/a>/i);
    if (!m) continue;
    const title = decodeEntities(m[3]).trim();
    const url = absUrl(m[1]);
    const price = parsePrice(block);
    const inStock = parseStock(block);
    offers.push({
      supplier: 'TAGGSM',
      title,
      price,
      currency: 'RUB',
      inStock,
      url,
      sku: m[2],
      fetchedAt: new Date().toISOString(),
    });
  }
  return offers;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 25000,
    responseType: 'text',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data || '');
}

let appleModelsCache = null;
let appleModelsCachedAt = 0;

async function loadAppleModelMap() {
  const now = Date.now();
  if (appleModelsCache && now - appleModelsCachedAt < 6 * 60 * 60 * 1000) {
    return appleModelsCache;
  }
  const map = { ...APPLE_MODEL_IDS };
  try {
    const html = await fetchHtml(
      `${BASE}/index.php?route=product/podbor&reestr_fabricator_id=${APPLE_FABRICATOR_ID}`,
    );
    const re = /<option[^>]*value="(\d+)"[^>]*>\s*([^<]*iPhone[^<]*)<\/option>/gi;
    let m;
    while ((m = re.exec(html))) {
      const name = decodeEntities(m[2]).trim().toLowerCase().replace(/\s+/g, ' ');
      if (name) map[name] = Number(m[1]);
    }
  } catch {
    // keep seed
  }
  appleModelsCache = map;
  appleModelsCachedAt = now;
  return map;
}

async function resolveAppleModelId(modelKey) {
  const map = await loadAppleModelMap();
  if (map[modelKey]) return map[modelKey];
  // soft match without trailing spaces / casing
  const hit = Object.keys(map).find((k) => k === modelKey || k.replace(/\s+/g, '') === modelKey.replace(/\s+/g, ''));
  return hit ? map[hit] : null;
}

function filterOffers(offers, { partKind, modelKey, query }) {
  return filterRelevant(offers, {
    partKind,
    modelKey,
    query,
    minPrice: 20,
  });
}

function partSearchPrefix(partKind, partLabel, query) {
  if (partLabel) return `${partLabel} для`;
  const map = {
    battery: 'АКБ для',
    backglass: 'Задняя крышка для',
    display: 'Дисплей для',
    flex: 'Шлейф для',
    camera: 'Камера для',
    camera_glass: 'Стекло камеры для',
    charging: 'Разъем зарядки для',
    speaker: 'Динамик для',
    microphone: 'Микрофон для',
    button: 'Кнопка для',
    sim: 'Держатель сим для',
    vibrator: 'Вибро для',
    antenna: 'Антенна для',
    adhesive: 'Скотч для',
    touchglass: 'Тачскрин для',
  };
  if (map[partKind]) return map[partKind];
  const first = String(query || '').split(/\s+/)[0] || '';
  return first;
}

/**
 * @param {{ query: string, brand?: string, model?: string, partKind?: string, limit?: number }} params
 */
async function searchTaggsm(params) {
  const query = String(params.query || '').trim();
  const brand = String(params.brand || '').trim();
  const model = String(params.model || '').trim();
  const partKind = params.partKind || 'any';
  const limit = Math.min(Number(params.limit) || 12, 30);

  const modelKey = normalizeModelKey(brand, model);
  const modelId = await resolveAppleModelId(modelKey);

  let offers = [];
  let source = 'none';

  if (modelId) {
    const urls = [];
    const cat = taggsmCategoryPath(partKind);
    if (cat) {
      urls.push(
        `${BASE}/index.php?route=product/category&path=${cat}&reestr_fabricator_id=${APPLE_FABRICATOR_ID}&reestr_model_id=${modelId}`,
      );
    }
    urls.push(
      `${BASE}/index.php?reestr_fabricator_id=${APPLE_FABRICATOR_ID}&reestr_model_id=${modelId}&route=product/podbor`,
    );

    for (const url of urls) {
      try {
        const html = await fetchHtml(url);
        const parsed = parseProductLayouts(html);
        const filtered = filterOffers(parsed, { partKind, modelKey, query });
        if (filtered.length) {
          offers = filtered;
          source = url.includes('category') ? 'category+model' : 'podbor';
          break;
        }
      } catch {
        // try next
      }
    }
  }

  // Search fallback only if podbor empty — ALWAYS hard-filter
  if (offers.length < 2 && query) {
    try {
      const prefix = partSearchPrefix(partKind, params.partLabel, query);
      const searchQ = modelKey ? `${prefix} ${modelKey}`.replace(/\s+/g, ' ').trim() : query;
      const url = `${BASE}/index.php?route=product/search&search=${encodeURIComponent(searchQ)}`;
      const html = await fetchHtml(url);
      const searched = filterOffers(parseProductLayouts(html), { partKind, modelKey, query: searchQ });
      if (searched.length) {
        const merged = new Map(offers.map((o) => [o.sku || o.url, o]));
        for (const o of searched) {
          if (!merged.has(o.sku || o.url)) merged.set(o.sku || o.url, o);
        }
        offers = filterOffers([...merged.values()], { partKind, modelKey, query });
        source = offers.length ? 'search' : source;
      }
    } catch {
      // ignore
    }
  }

  // Final hard gate: if we know part/model, never leak unrelated catalog noise
  offers = filterOffers(offers, { partKind, modelKey, query });

  return {
    supplier: 'TAGGSM',
    ok: offers.length > 0,
    offers: offers.slice(0, limit),
    source,
    error: offers.length ? null : 'no_offers',
    hint: offers.length
      ? null
      : modelId
        ? 'На TAGGSM нет подходящих позиций по модели/типу запчасти'
        : 'Не удалось сопоставить модель Apple на TAGGSM',
  };
}

module.exports = {
  searchTaggsm,
  APPLE_MODEL_IDS,
  partMatches,
  modelMatches,
};
