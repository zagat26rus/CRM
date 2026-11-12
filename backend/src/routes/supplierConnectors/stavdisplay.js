/**
 * StavDisplay (Ставрополь) — Tilda site with price tables (t431).
 */
const { fetchHtml, isBlocked, decodeEntities } = require('./htmlUtils');
const { modelMatches: modelMatchesExact, normalizeModelKey } = require('./relevance');

const BASE = 'https://stavdisplay.ru';
const CITY = 'Ставрополь';

/** Category pages discovered from homepage. */
const CATEGORY_PAGES = {
  battery: '/page95529646.html',
  display: '/page95477566.html',
  camera: '/page95534426.html',
  backglass: '/page95534426.html', // крышки nearby; display page also useful
  charging: '/page95534636.html', // шлейфы
  any: '/page95529646.html',
};

function pickNumber(cell) {
  const s = String(cell || '').trim();
  if (!s || s === '-' || /нет в наличии/i.test(s)) return { price: null, inStock: /нет в наличии/i.test(s) ? false : null, note: s };
  // take first integer price like 800 or 1000(Orig) or 900(JCID)/650(Orig)
  const m = s.match(/(\d{3,6})/);
  if (!m) return { price: null, inStock: null, note: s };
  return { price: Number(m[1]), inStock: true, note: s };
}

function parseT431Tables(html, pageUrl) {
  const offers = [];
  const parts1 = [...html.matchAll(/class="t431__data-part1"[^>]*>([\s\S]*?)<\/div>/gi)];
  const parts2 = [...html.matchAll(/class="t431__data-part2"[^>]*>([\s\S]*?)<\/div>/gi)];
  const n = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < n; i++) {
    const headers = decodeEntities(parts1[i][1])
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean);
    const rows = decodeEntities(parts2[i][1])
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const row of rows) {
      const cells = row.split(';').map((x) => x.trim());
      if (!cells.length) continue;
      const model = cells[0];
      if (!model || /^модель/i.test(model)) continue;
      for (let c = 1; c < cells.length; c++) {
        const header = headers[c] || `col${c}`;
        const { price, inStock, note } = pickNumber(cells[c]);
        if (price == null && !note) continue;
        if (note === '-' && price == null) continue;
        const title = `АКБ / ${header} · iPhone ${model}`.replace(/\s+/g, ' ').trim();
        // Prefer battery-like headers; still emit priced cells
        if (price == null && /нет в наличии/i.test(note || '')) {
          offers.push({
            supplier: 'StavDisplay',
            city: CITY,
            title: `${title} (нет в наличии)`,
            price: null,
            currency: 'RUB',
            inStock: false,
            url: pageUrl,
            sku: null,
            note,
            fetchedAt: new Date().toISOString(),
          });
          continue;
        }
        if (price == null) continue;
        offers.push({
          supplier: 'StavDisplay',
          city: CITY,
          title,
          price,
          currency: 'RUB',
          inStock,
          url: pageUrl,
          sku: null,
          note,
          fetchedAt: new Date().toISOString(),
        });
      }
    }
  }
  return offers;
}

function modelMatches(titleOrModel, model) {
  if (!model) return true;
  const key = normalizeModelKey('Apple', model);
  // Tables often store bare "14" / "14 Pro"
  const bare = String(titleOrModel || '');
  const asIphone = /iphone/i.test(bare) ? bare : `iPhone ${bare}`;
  return modelMatchesExact(asIphone, key) || modelMatchesExact(bare, key);
}

async function searchStavdisplay(params) {
  const query = String(params.query || '').trim();
  const partKind = params.partKind || 'any';
  const model = String(params.model || '').trim();
  const limit = Math.min(Number(params.limit) || 12, 40);
  const pagePath = CATEGORY_PAGES[partKind] || CATEGORY_PAGES.any;
  const url = `${BASE}${pagePath}`;

  try {
    const { status, html } = await fetchHtml(url, { referer: BASE });
    if (isBlocked(html, status)) {
      return {
        supplier: 'StavDisplay',
        ok: false,
        offers: [],
        error: 'blocked',
        city: CITY,
        hint: 'StavDisplay временно недоступен',
      };
    }
    let offers = parseT431Tables(html, url);
    // If page is display category, retitle
    if (partKind === 'display') {
      offers = offers.map((o) => ({ ...o, title: o.title.replace(/^АКБ\s*\/\s*/i, 'Дисплей / ') }));
    }
    if (model) {
      offers = offers.filter((o) => modelMatches(o.title, model) || modelMatches(o.note || '', model));
    } else if (query) {
      const q = query.toLowerCase();
      const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
      offers = offers.filter((o) => tokens.some((t) => o.title.toLowerCase().includes(t)));
    }
    offers.sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));
    if (!offers.length) {
      return {
        supplier: 'StavDisplay',
        ok: true,
        offers: [],
        source: url,
        city: CITY,
        hint: 'Прайс-таблица загружена, но точной позиции не найдено — откройте категорию на сайте',
      };
    }
    return { supplier: 'StavDisplay', ok: true, offers: offers.slice(0, limit), source: url, city: CITY };
  } catch (e) {
    return {
      supplier: 'StavDisplay',
      ok: false,
      offers: [],
      error: e.message || 'fetch_failed',
      city: CITY,
    };
  }
}

module.exports = { searchStavdisplay, CATEGORY_PAGES };
