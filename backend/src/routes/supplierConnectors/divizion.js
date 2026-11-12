/**
 * Divizion126 (Ставрополь) — Bitrix/Aspro catalog.
 */
const { absUrl, fetchHtml, isBlocked, decodeEntities } = require('./htmlUtils');
const { filterRelevant, normalizeModelKey } = require('./relevance');

const BASE = 'https://www.divizion126.ru';
const CITY = 'Ставрополь';
const MIN_PRICE = 40;

function parseOffers(html) {
  const offers = [];
  const re =
    /href="([^"]+)"[^>]*class="[^"]*dark_link js-notice-block__title[^"]*"[^>]*>\s*<span>([^<]{4,220})<\/span>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = decodeEntities(m[2]).trim();
    const chunk = html.slice(m.index, m.index + 2200);
    const pm =
      chunk.match(/price_value[^>]*>\s*([\d\s\u00a0]+)/i) ||
      chunk.match(/([\d\s\u00a0]{2,10})\s*₽/);
    let price = null;
    if (pm) {
      const d = pm[1].replace(/\D/g, '');
      if (d) price = Number(d);
    }
    // ignore placeholder / broken prices (2–4 ₽ etc.)
    if (price != null && price < MIN_PRICE) price = null;
    let inStock = null;
    if (/нет в наличии/i.test(chunk)) inStock = false;
    else if (/в наличии/i.test(chunk)) inStock = true;
    offers.push({
      supplier: 'Divizion',
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
  const out = [];
  for (const o of offers) {
    const k = `${o.title}|${o.price}|${o.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

async function searchDivizion(params) {
  const query = String(params.query || '').trim();
  const model = String(params.model || '').trim();
  const partKind = params.partKind || 'any';
  const partLabel = String(params.partLabel || '').trim();
  const cookie = String(params.cookie || '').trim();
  const limit = Math.min(Number(params.limit) || 12, 30);
  const modelKey = normalizeModelKey(params.brand, model);

  if (!query && !model) {
    return { supplier: 'Divizion', ok: false, offers: [], error: 'empty_query', city: CITY };
  }

  const qVariants = [
    ...new Set(
      [
        query,
        [partLabel, model].filter(Boolean).join(' '),
        partKind === 'battery' && model ? `АКБ ${model}` : '',
        partKind === 'battery' && model ? `аккумулятор ${model}` : '',
        partKind === 'backglass' && model ? `крышка ${model}` : '',
        partKind === 'backglass' && model ? `задняя крышка ${model}` : '',
        partKind === 'display' && model ? `дисплей ${model}` : '',
        partKind === 'flex' && model ? `шлейф ${model}` : '',
        partKind === 'charging' && model ? `разъем зарядки ${model}` : '',
        partKind === 'camera' && model ? `камера ${model}` : '',
        model,
      ]
        .map((s) => String(s || '').trim())
        .filter(Boolean),
    ),
  ];

  const urls = [];
  if (partKind === 'battery') {
    urls.push(
      `${BASE}/catalog/zapchasti-raskhodniki-oborudovanie-dlya-remonta_1/apple/akb-musttby_1/`,
    );
  }
  for (const q of qVariants) {
    urls.push(`${BASE}/search/?search=${encodeURIComponent(q)}&q=${encodeURIComponent(q)}`);
  }

  let lastError = null;
  let best = [];
  let bestUrl = '';
  for (const url of urls) {
    try {
      const { status, html } = await fetchHtml(url, { cookie, referer: BASE });
      if (isBlocked(html, status)) {
        lastError = 'blocked';
        continue;
      }
      let offers = filterRelevant(parseOffers(html), {
        partKind,
        modelKey,
        model,
        query: query || `${partLabel} ${model}`,
        minPrice: MIN_PRICE,
      });
      // Drop unpriced junk after filter
      const priced = offers.filter((o) => o.price != null);
      if (priced.length) offers = priced;
      if (!offers.length) {
        lastError = 'no_offers';
        continue;
      }
      if (
        offers.length > best.length ||
        (offers[0]?.price != null && (best[0]?.price == null || offers[0].price < (best[0].price ?? 9e9)))
      ) {
        best = offers;
        bestUrl = url;
      }
      if (offers.some((o) => o.price != null && o.price >= MIN_PRICE)) {
        return {
          supplier: 'Divizion',
          ok: true,
          offers: offers.slice(0, limit),
          source: url,
          city: CITY,
        };
      }
      lastError = 'no_offers';
    } catch (e) {
      lastError = e.message || 'fetch_failed';
    }
  }

  if (best.length) {
    return {
      supplier: 'Divizion',
      ok: true,
      offers: best.slice(0, limit),
      source: bestUrl,
      city: CITY,
    };
  }

  return {
    supplier: 'Divizion',
    ok: false,
    offers: [],
    error: lastError || 'unreachable',
    city: CITY,
    hint:
      lastError === 'blocked'
        ? 'Divizion вернул блокировку — попробуйте позже'
        : 'Нет совпадений в Divizion',
  };
}

module.exports = { searchDivizion };
