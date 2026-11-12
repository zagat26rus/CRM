const { cfg } = require('./config');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const [int, frac] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const sign = n < 0 ? '-' : '';
  return `${sign}${grouped}${frac === '00' ? '' : `,${frac}`}\u00a0₽`;
}

function num(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100).replace('.', ',');
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: cfg().timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatDate(iso) {
  if (!iso) return '';
  const s = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(s) ? 'UTC' : cfg().timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function phonePretty(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return raw ? String(raw) : '';
}

function clip(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Границы суток/недели/месяца в часовом поясе компании, в виде ISO UTC для сравнения со строками в БД. */
function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function zoneOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function startOfZonedDay(date, timeZone, addDays = 0) {
  const p = zonedParts(date, timeZone);
  const guess = new Date(Date.UTC(p.y, p.m - 1, p.d + addDays, 0, 0, 0));
  return new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
}

function periodRange(kind, now = new Date()) {
  const tz = cfg().timeZone;
  const today = startOfZonedDay(now, tz, 0);
  const tomorrow = startOfZonedDay(now, tz, 1);
  switch (kind) {
    case 'yesterday':
      return { from: startOfZonedDay(now, tz, -1), to: today, label: 'Вчера' };
    case 'week':
      return { from: startOfZonedDay(now, tz, -6), to: tomorrow, label: 'Последние 7 дней' };
    case 'month': {
      const p = zonedParts(now, tz);
      const first = new Date(Date.UTC(p.y, p.m - 1, 1, 0, 0, 0));
      return { from: new Date(first.getTime() - zoneOffsetMs(first, tz)), to: tomorrow, label: 'С начала месяца' };
    }
    case 'today':
    default:
      return { from: today, to: tomorrow, label: 'Сегодня' };
  }
}

function zonedHour(date = new Date()) {
  return zonedParts(date, cfg().timeZone).h;
}

function zonedDateKey(date = new Date()) {
  const p = zonedParts(date, cfg().timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

module.exports = {
  esc,
  money,
  num,
  formatDateTime,
  formatDate,
  phonePretty,
  clip,
  periodRange,
  zonedHour,
  zonedDateKey,
};
