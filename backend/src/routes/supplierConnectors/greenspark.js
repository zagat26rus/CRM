/**
 * GreenSpark connector.
 * Site uses JS challenge (__js_p_ / __jhash_ / __jua_ → __hash_).
 * Optional Cookie from company AI settings (magazine, PHPSESSID, …).
 */
const axios = require('axios');
const { mergeCookies } = require('./htmlUtils');
const { filterRelevant, normalizeModelKey } = require('./relevance');

const BASE = 'https://green-spark.ru';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function absUrl(href) {
  const h = decodeEntities(href).trim();
  if (!h) return BASE;
  if (h.startsWith('http')) return h;
  return `${BASE}${h.startsWith('/') ? '' : '/'}${h}`;
}

function isChallenge(html) {
  const s = String(html || '');
  return s.includes('gorizontal-vertikal') || /function get_jhash\s*\(/i.test(s);
}

function getJhash(b) {
  let x = 123456789;
  let k = 0;
  for (let i = 0; i < 1677696; i++) {
    x = ((x + b) ^ (x + (x % 3) + (x % 17) + b) ^ i) % 16776960;
    if (x % 117 === 0) k = (k + 1) % 1111;
  }
  return k;
}

function fixedEncodeURIComponent(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
}

function parseSetCookiePairs(headers) {
  return (headers['set-cookie'] || []).map((c) => String(c).split(';')[0].trim()).filter(Boolean);
}

function stripChallengeCookies(cookie) {
  const drop = new Set(['__js_p_', '__jhash_', '__jua_']);
  const map = new Map();
  String(cookie || '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i <= 0) return;
      const k = pair.slice(0, i).trim();
      if (drop.has(k)) return;
      map.set(k, pair.slice(i + 1).trim());
    });
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithChallenge(url, baseCookie) {
  let cookie = stripChallengeCookies(baseCookie);
  let last = { status: 0, html: '', url };

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await axios.get(url, {
      timeout: 25000,
      responseType: 'text',
      maxRedirects: 0,
      validateStatus: (s) => (s >= 200 && s < 400) || s === 403,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        ...(cookie ? { Cookie: cookie } : {}),
        Referer: BASE + '/',
      },
    });

    const setPairs = parseSetCookiePairs(res.headers);
    if (setPairs.length) cookie = mergeCookies(cookie, setPairs.join('; '));

    // follow redirects manually so Set-Cookie is kept
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      if (!loc) break;
      url = loc.startsWith('http') ? loc : absUrl(loc);
      last = { status: res.status, html: '', url };
      continue;
    }

    const html = String(res.data || '');
    last = { status: res.status, html, url };

    if (!isChallenge(html)) {
      return { ...last, cookie };
    }

    const jsP =
      setPairs.find((c) => c.startsWith('__js_p_='))?.slice(8) ||
      (cookie.match(/(?:^|;\s*)__js_p_=([^;]+)/) || [])[1];
    if (!jsP) break;

    const code = parseInt(String(jsP).split(',')[0], 10) || 0;
    const jhash = getJhash(code);
    const jua = fixedEncodeURIComponent(UA);
    cookie = mergeCookies(
      stripChallengeCookies(cookie),
      `__js_p_=${jsP}`,
      `__jhash_=${jhash}`,
      `__jua_=${jua}`
    );
    await sleep(1100);
  }

  return { ...last, cookie };
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseOffers(html) {
  const text = String(html || '');
  const offers = [];

  // Vue SSR cards: class="card product-card"
  const cardStarts = [];
  const cardRe = /class="[^"]*\bproduct-card\b[^"]*"/gi;
  let cm;
  while ((cm = cardRe.exec(text))) cardStarts.push(cm.index);
  const cards = cardStarts.map((idx, i) => {
    const end = i + 1 < cardStarts.length ? cardStarts[i + 1] : Math.min(text.length, idx + 4000);
    return text.slice(Math.max(0, idx - 40), end);
  });

  for (const block of cards.slice(0, 40)) {
    const nameBlock =
      block.match(
        /product-card-name[\s\S]{0,80}?<a[^>]+href="([^"]+)"[^>]*>\s*(?:<span[^>]*>)?([\s\S]{4,240}?)(?:<\/span>)?\s*<\/a>/i
      ) ||
      block.match(/<a[^>]+href="([^"]+\.html)"[^>]*>\s*(?:<span[^>]*>)?\s*([^<]{4,200})\s*(?:<\/span>)?\s*<\/a>/i);
    if (!nameBlock) continue;
    const title = stripTags(nameBlock[2]);
    if (title.length < 4) continue;

    // Prefer wholesale (second-price), else any price-value, else any ₽ in card
    const nums = [];
    const second = block.match(
      /second-price[\s\S]{0,200}?price-value[^>]*>\s*(?:<!--\[-->)?\s*([\d\s\u00a0]{2,12})\s*₽/i
    );
    if (second) {
      const d = second[1].replace(/\D/g, '');
      if (d) nums.push(Number(d));
    }
    if (!nums.length) {
      const pv = [...block.matchAll(/price-value[^>]*>\s*(?:<!--\[-->)?\s*([\d\s\u00a0]{2,12})\s*₽/gi)];
      for (const m of pv) {
        const d = m[1].replace(/\D/g, '');
        if (d) nums.push(Number(d));
      }
    }
    if (!nums.length) {
      const pre = /([\d\s\u00a0]{2,12})\s*₽/gi;
      let m;
      while ((m = pre.exec(block))) {
        const d = m[1].replace(/\D/g, '');
        if (d) nums.push(Number(d));
      }
    }
    const price = nums.length ? Math.min(...nums) : null;
    let inStock = null;
    if (/нет в наличии|под заказ|unavailable/i.test(block)) inStock = false;
    else if (/в наличии|quantity-indicator/i.test(block)) inStock = true;

    offers.push({
      supplier: 'GreenSpark',
      city: 'Ставрополь',
      title,
      price,
      currency: 'RUB',
      inStock,
      url: absUrl(nameBlock[1]),
      sku: null,
      fetchedAt: new Date().toISOString(),
    });
  }

  const seen = new Set();
  const uniq = [];
  for (const o of offers) {
    const k = `${o.title}|${o.price}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(o);
  }
  return uniq;
}

function buildQueryVariants(params) {
  const query = String(params.query || '').trim();
  const model = String(params.model || '').trim();
  const partLabel = String(params.partLabel || '').trim();
  const kind = String(params.partKind || '');
  const variants = [];
  const push = (q) => {
    const s = String(q || '').replace(/\s+/g, ' ').trim();
    if (s && !variants.includes(s)) variants.push(s);
  };
  push(query);
  push(query.replace(/\bApple\b/gi, '').replace(/\s+/g, ' '));
  if (partLabel && model) push(`${partLabel} ${model}`);
  if (model) {
    if (kind === 'battery') {
      push(`АКБ ${model}`);
      push(`аккумулятор ${model}`);
    }
    if (kind === 'display') push(`дисплей ${model}`);
    if (kind === 'flex') push(`шлейф ${model}`);
    if (kind === 'backglass') {
      push(`задняя крышка ${model}`);
      push(`крышка ${model}`);
      push(`корпус ${model}`);
    }
    if (kind === 'camera') push(`камера ${model}`);
    if (kind === 'camera_glass') push(`стекло камеры ${model}`);
    if (kind === 'charging') push(`разъем зарядки ${model}`);
    if (kind === 'speaker') push(`динамик ${model}`);
    if (kind === 'microphone') push(`микрофон ${model}`);
    if (kind === 'button') push(`кнопка ${model}`);
    if (kind === 'sim') push(`держатель сим ${model}`);
    if (kind === 'adhesive') push(`скотч ${model}`);
  }
  return variants.length ? variants : [query];
}

/**
 * @param {{ query: string, cookie?: string, limit?: number, model?: string, partKind?: string, partLabel?: string }} params
 */
async function searchGreenspark(params) {
  const cookie = String(params.cookie || '').trim();
  const limit = Math.min(Number(params.limit) || 12, 30);
  const queryVariants = buildQueryVariants(params);
  if (!queryVariants[0]) {
    return { supplier: 'GreenSpark', ok: false, offers: [], error: 'empty_query' };
  }

  let lastError = null;
  let sessionCookie = cookie;

  for (const query of queryVariants) {
    const urls = [
      `${BASE}/search/?q=${encodeURIComponent(query)}`,
      `${BASE}/search/index.php?q=${encodeURIComponent(query)}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetchWithChallenge(url, sessionCookie);
        sessionCookie = res.cookie || sessionCookie;
        const html = String(res.html || '');
        if (isChallenge(html) || res.status === 403) {
          lastError = 'blocked';
          continue;
        }
        const modelKey = normalizeModelKey(params.brand, params.model);
        const offers = filterRelevant(parseOffers(html), {
          partKind: params.partKind || 'any',
          modelKey,
          model: params.model,
          query: query || params.query,
          minPrice: 30,
        }).slice(0, limit);
        if (offers.length) {
          return { supplier: 'GreenSpark', ok: true, offers, source: res.url || url };
        }
        lastError = 'no_offers';
      } catch (e) {
        lastError = e.message || 'fetch_failed';
      }
    }
  }

  return {
    supplier: 'GreenSpark',
    ok: false,
    offers: [],
    error: lastError || 'unreachable',
    hint:
      lastError === 'blocked'
        ? 'Сайт GreenSpark блокирует автоматический доступ. В настройках ИИ вставьте Cookie из браузера (после входа на green-spark.ru).'
        : 'Не удалось получить выдачу GreenSpark',
  };
}

module.exports = { searchGreenspark };
