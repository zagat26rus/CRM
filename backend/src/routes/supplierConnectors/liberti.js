/**
 * Liberti — often 403 without browser cookies. Supports optional cookie from settings.
 * Focus: Stavropol store page + site search.
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

const BASE = 'https://liberti.ru';
const CITY = 'Ставрополь';
const STORE_URL = 'https://liberti.ru/kontakty/store/468777/';

function parseGenericOffers(html, base) {
  const offers = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]{6,180})\s*<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = decodeEntities(m[2]).trim();
    if (!/аккум|акб|диспле|экран|камер|шлейф|iphone|samsung/i.test(title)) continue;
    if (/меню|каталог|корзина|войти|контакты/i.test(title)) continue;
    const chunk = html.slice(Math.max(0, m.index - 120), m.index + 900);
    const price = parsePriceFromText(chunk);
    const inStock = stockFromText(chunk);
    offers.push({
      supplier: 'Liberti',
      city: CITY,
      title,
      price,
      currency: 'RUB',
      inStock,
      url: absUrl(base, href),
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

async function searchLiberti(params) {
  const query = String(params.query || '').trim();
  const cookie = String(params.cookie || '').trim();
  const limit = Math.min(Number(params.limit) || 12, 30);
  if (!query) return { supplier: 'Liberti', ok: false, offers: [], error: 'empty_query', city: CITY };

  const urls = [
    `${BASE}/search/?q=${encodeURIComponent(query)}`,
    `${BASE}/search/?query=${encodeURIComponent(query)}`,
    `${BASE}/catalog/?q=${encodeURIComponent(query)}`,
    STORE_URL,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const { status, html } = await fetchHtml(url, { cookie, referer: BASE });
      if (isBlocked(html, status) || status === 403) {
        lastError = 'blocked';
        continue;
      }
      let offers = filterRelevant(parseGenericOffers(html, BASE), {
        partKind: params.partKind || 'any',
        model: params.model,
        modelKey: normalizeModelKey(params.brand, params.model),
        query,
        minPrice: 30,
      }).slice(0, limit);
      if (offers.length) return { supplier: 'Liberti', ok: true, offers, source: url, city: CITY };
      lastError = 'no_offers';
    } catch (e) {
      lastError = e.message || 'fetch_failed';
    }
  }

  return {
    supplier: 'Liberti',
    ok: false,
    offers: [],
    error: lastError || 'unreachable',
    city: CITY,
    hint:
      lastError === 'blocked'
        ? 'Liberti блокирует доступ. В настройках ИИ вставьте Cookie после входа на liberti.ru (магазин Ставрополь).'
        : 'Нет данных Liberti',
  };
}

module.exports = { searchLiberti, STORE_URL };
