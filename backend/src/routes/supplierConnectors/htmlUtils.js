const axios = require('axios');

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

function absUrl(base, href) {
  const h = decodeEntities(href).trim();
  if (!h) return base;
  if (h.startsWith('http')) return h;
  if (h.startsWith('//')) return `https:${h}`;
  const root = String(base || '').replace(/\/$/, '');
  return `${root}${h.startsWith('/') ? '' : '/'}${h}`;
}

function isBlocked(html, status) {
  const s = String(html || '');
  if (status === 403 || status === 503) return true;
  return (
    s.includes('gorizontal-vertikal') ||
    /Checking your browser|ddos-guard|cf-browser-verification|Access denied|Forbidden/i.test(s)
  );
}

function parsePriceFromText(text) {
  const nums = [];
  const re = /([\d\s\u00a0]{2,12})\s*(?:₽|руб\.?|р\.)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const d = m[1].replace(/\D/g, '');
    if (d) nums.push(Number(d));
  }
  if (!nums.length) return null;
  return Math.min(...nums);
}

function stockFromText(text) {
  const s = String(text || '');
  if (/нет в наличии|под заказ|ожидается/i.test(s)) return false;
  if (/в наличии|есть в наличии/i.test(s)) return true;
  return null;
}

function mergeCookies(...parts) {
  const map = new Map();
  for (const part of parts) {
    String(part || '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const i = pair.indexOf('=');
        if (i <= 0) return;
        map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      });
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function isBegetGate(html) {
  return /function set_cookie\(\)|cookie\s*=\s*['"]beget=begetok/i.test(String(html || ''));
}

async function fetchHtml(url, { cookie, referer, timeout = 25000 } = {}) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    Referer: referer || 'https://www.google.com/',
  };
  let cookieHeader = String(cookie || '').trim();
  if (cookieHeader) headers.Cookie = cookieHeader;

  async function once(extraCookie) {
    const h = { ...headers };
    const merged = mergeCookies(cookieHeader, extraCookie);
    if (merged) h.Cookie = merged;
    const res = await axios.get(url, {
      timeout,
      responseType: 'text',
      headers: h,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 500,
    });
    return { status: res.status, html: String(res.data || ''), headers: res.headers || {} };
  }

  let result = await once('');
  // Beget anti-bot interstitial: set beget=begetok and retry
  if (isBegetGate(result.html) || result.html.length < 800) {
    result = await once('beget=begetok');
  }
  return result;
}

function filterByQuery(offers, query, { model } = {}) {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/[\s,/|+]+/)
    .filter((t) => t.length >= 3 && !['для', 'apple', 'samsung'].includes(t));
  let list = offers.slice();
  if (model) {
    const mk = String(model).toLowerCase();
    const tight = list.filter((o) => String(o.title || '').toLowerCase().includes(mk));
    if (tight.length) list = tight;
  }
  if (tokens.length) {
    const scored = list
      .map((o) => {
        const t = String(o.title || '').toLowerCase();
        let score = 0;
        for (const tok of tokens) if (t.includes(tok)) score += 1;
        return { o, score };
      })
      .filter((x) => x.score > 0 || tokens.length === 0)
      .sort((a, b) => b.score - a.score || (a.o.price ?? 9e9) - (b.o.price ?? 9e9));
    if (scored.length) list = scored.map((x) => x.o);
  }
  return list;
}

module.exports = {
  decodeEntities,
  absUrl,
  isBlocked,
  parsePriceFromText,
  stockFromText,
  fetchHtml,
  filterByQuery,
  mergeCookies,
  isBegetGate,
};
