/**
 * Siriust.ru — often 503. Cookie optional. Stavropol parts supplier.
 */
const {
  absUrl,
  fetchHtml,
  isBlocked,
  parsePriceFromText,
  stockFromText,
  decodeEntities,
} = require('./htmlUtils');
const { filterRelevant, normalizeModelKey } = require('./relevance');

const BASE = 'https://siriust.ru';
const CITY = 'Ставрополь';

function parseGenericOffers(html) {
  const offers = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]{6,180})\s*<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = decodeEntities(m[2]).trim();
    if (!/аккум|акб|диспле|экран|камер|шлейф|iphone|samsung|xiaomi/i.test(title)) continue;
    if (/меню|каталог|корзина|войти|контакты|главная/i.test(title)) continue;
    const chunk = html.slice(Math.max(0, m.index - 120), m.index + 900);
    const price = parsePriceFromText(chunk);
    const inStock = stockFromText(chunk);
    offers.push({
      supplier: 'Siriust',
      city: CITY,
      title,
      price,
      currency: 'RUB',
      inStock,
      url: absUrl(BASE, href),
      sku: null,
      fetchedAt: new Date().toISOString(),
    });
  }
  const seen = new Set();
  return offers.filter((o) => {
    const k = o.title + o.url;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function searchSiriust(params) {
  const query = String(params.query || '').trim();
  const cookie = String(params.cookie || '').trim();
  const limit = Math.min(Number(params.limit) || 12, 30);
  if (!query) return { supplier: 'Siriust', ok: false, offers: [], error: 'empty_query', city: CITY };

  const urls = [
    `${BASE}/search/?q=${encodeURIComponent(query)}`,
    `${BASE}/?s=${encodeURIComponent(query)}`,
    `${BASE}/catalog/?q=${encodeURIComponent(query)}`,
    `${BASE}/`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const { status, html } = await fetchHtml(url, { cookie, referer: BASE });
      if (isBlocked(html, status) || status === 503 || status === 403) {
        lastError = status === 503 ? 'unavailable' : 'blocked';
        continue;
      }
      let offers = filterRelevant(parseGenericOffers(html), {
        partKind: params.partKind || 'any',
        model: params.model,
        modelKey: normalizeModelKey(params.brand, params.model),
        query,
        minPrice: 30,
      }).slice(0, limit);
      if (offers.length) return { supplier: 'Siriust', ok: true, offers, source: url, city: CITY };
      lastError = 'no_offers';
    } catch (e) {
      lastError = e.message || 'fetch_failed';
    }
  }

  return {
    supplier: 'Siriust',
    ok: false,
    offers: [],
    error: lastError || 'unreachable',
    city: CITY,
    hint:
      lastError === 'unavailable' || lastError === 'blocked'
        ? 'Siriust недоступен/блокирует ботов. Можно вставить Cookie в настройках ИИ после входа на siriust.ru.'
        : 'Нет данных Siriust',
  };
}

module.exports = { searchSiriust };
