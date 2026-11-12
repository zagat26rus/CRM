/**
 * Shared relevance helpers for supplier connectors.
 * Full part taxonomy + hard filters so unrelated catalog noise never leaks.
 */

const PART_DEFS = [
  {
    kind: 'battery',
    label: 'АКБ',
    rx: /аккум|акб|батар|battery/i,
    titleRx: /аккум|акб|батар|battery/i,
    rejectRx: /скотч|проклейк|коннектор акб|шлейф для коррекции|плата jc|инструмент|чехол|защита контроллера|держатель сим/i,
    taggsmPath: '900000_900010',
    crmIssue: 'Замена АКБ',
  },
  {
    kind: 'display',
    label: 'Дисплей',
    rx: /диспле|экран|display|lcd|oled(?!\s*шлейф)/i,
    titleRx: /диспле|экран|display|lcd|oled|тачскрин\s*\+|модуль диспле/i,
    rejectRx: /скотч|защитн.*(стекл|плен)|стекло\s+камер|держатель сим|^шлейф/i,
    taggsmPath: '900000_900017',
    crmIssue: 'Замена дисплея',
  },
  {
    kind: 'touchglass',
    label: 'Тачскрин',
    rx: /тачскрин|тач\b|touch\s*screen/i,
    titleRx: /тачскрин|touch/i,
    rejectRx: /диспле\s*\+|защитн|скотч/i,
    taggsmPath: '900000_900018',
    crmIssue: '',
  },
  {
    kind: 'flex',
    label: 'Шлейф',
    rx: /шлейф/i,
    titleRx: /^шлейф|\bшлейф для\b/i,
    rejectRx: /акб|аккум|диспле|скотч|держатель сим|стекло\s+камер/i,
    taggsmPath: '900000_900009',
    crmIssue: '',
  },
  {
    kind: 'charging',
    label: 'Разъём зарядки',
    rx: /разъ[её]м\s*заряд|зарядн(ый|ого)\s*разъ|нижн(ий|яя)\s*шлейф|lightning|type-?c\s*разъ/i,
    titleRx: /разъ[её]м\s*заряд|зарядк|lightning|type-?c|шлейф.*заряд/i,
    rejectRx: /автомобильн|power\s*bank|внешн|скотч/i,
    taggsmPath: '900000_900019',
    crmIssue: 'Замена разъема зарядки',
  },
  {
    kind: 'camera_glass',
    label: 'Стекло камеры',
    rx: /стекл[оа]\s*(задней\s*)?камер|линз[аы]\s*камер/i,
    titleRx: /стекл[оа]\s*(задней\s*)?камер|линз/i,
    rejectRx: /модуль\s+камер|^камер[аы]\s+для|скотч|^шлейф/i,
    taggsmPath: '900000_900057',
    crmIssue: '',
  },
  {
    kind: 'camera',
    label: 'Камера',
    rx: /(?:модуль\s+)?камер|camera\b/i,
    titleRx: /(?:модуль\s+)?камер|camera/i,
    rejectRx: /стекло\s+задней\s+камер|стекло\s+камер|шлейф для восстановления|крышка|корпус|скотч|^шлейф/i,
    taggsmPath: '900000_900023',
    crmIssue: 'Замена камеры',
  },
  {
    kind: 'backglass',
    label: 'Задняя крышка',
    rx: /крышк|корпус(?!ные)|задн(яя|ее|ей)?\s*(крыш|стекл)|back\s*glass|housing/i,
    titleRx: /задн(яя|ее)?\s*крыш|крышка|корпус(?!ные)|housing|back\s*glass|заднее стекло/i,
    rejectRx: /скотч|сим[-\s]?лот|держатель сим|стекло\s+задней\s+камер|стекло\s+камер|рамк[аи]\s+диспле|тачскрин|акб|аккум|диспле|^шлейф/i,
    taggsmPath: '900000_900014',
    crmIssue: 'Замена заднего стекла',
  },
  {
    kind: 'speaker',
    label: 'Динамик',
    rx: /динамик|звонок|speaker|buzzer|разговорн/i,
    titleRx: /динамик|звонок|speaker|buzzer|разговорн/i,
    rejectRx: /сеточк|скотч|шлейф(?!.*динамик)/i,
    taggsmPath: '900000_535',
    crmIssue: '',
  },
  {
    kind: 'microphone',
    label: 'Микрофон',
    rx: /микрофон|microphone|\bmic\b/i,
    titleRx: /микрофон|microphone/i,
    rejectRx: /скотч|акб для|диспле для/i,
    taggsmPath: '900000_527',
    crmIssue: '',
  },
  {
    kind: 'button',
    label: 'Кнопка',
    rx: /кнопк(а|и|у)|power\s*button|volume\s*button/i,
    // On TAGGSM buttons are often sold as flex assemblies
    titleRx: /кнопк/i,
    rejectRx: /скотч|чехол|акб для|диспле для|держатель сим/i,
    taggsmPath: '900000_128',
    crmIssue: '',
  },
  {
    kind: 'sim',
    label: 'Держатель SIM',
    rx: /сим[-\s]?лот|sim[-\s]?tray|держатель\s*сим|лоток\s*сим/i,
    titleRx: /сим|sim|держатель\s*сим|лоток/i,
    rejectRx: /считывател|скотч|акб|диспле/i,
    taggsmPath: '900000_94',
    crmIssue: '',
  },
  {
    kind: 'vibrator',
    label: 'Вибромотор',
    rx: /вибро|vibra|taptic|taptic/i,
    titleRx: /вибро|vibra|taptic|taptic/i,
    rejectRx: /скотч/i,
    taggsmPath: '900000_96',
    crmIssue: '',
  },
  {
    kind: 'antenna',
    label: 'Антенна',
    rx: /антенн/i,
    titleRx: /антенн/i,
    rejectRx: /скотч|акб для|диспле для/i,
    taggsmPath: '900000_95',
    crmIssue: '',
  },
  {
    kind: 'adhesive',
    label: 'Скотч',
    rx: /скотч|проклейк|клей\s*акб|adhesive|sticker\s*battery/i,
    titleRx: /скотч|проклейк|клей/i,
    rejectRx: /акб для|диспле для|шлейф для|крышка для/i,
    taggsmPath: '900000_900082',
    crmIssue: '',
  },
];

const PART_BY_KIND = Object.fromEntries(PART_DEFS.map((p) => [p.kind, p]));

function detectPartKind(text) {
  const s = String(text || '');
  // More specific patterns first (order in PART_DEFS already tuned)
  for (const p of PART_DEFS) {
    if (p.rx.test(s)) return { kind: p.kind, label: p.label, taggsmPath: p.taggsmPath || '', crmIssue: p.crmIssue || '' };
  }
  return { kind: 'any', label: '', taggsmPath: '', crmIssue: '' };
}

function normalizeModelKey(brand, model) {
  const b = String(brand || '').trim().toLowerCase();
  const m = String(model || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!m) return '';
  if (b.includes('apple') || m.includes('iphone')) {
    return m.startsWith('iphone') ? m : `iphone ${m}`.replace(/\s+/g, ' ');
  }
  return m;
}

/** Exact-ish Apple model match: iPhone 14 ≠ 14 Plus / 14 Pro / 14 Pro Max. */
function modelMatches(title, modelOrKey) {
  if (!modelOrKey) return true;
  const t = String(title || '').toLowerCase().replace(/\s+/g, ' ');
  let key = String(modelOrKey).toLowerCase().trim().replace(/\s+/g, ' ');
  if (!key) return true;
  if (!key.startsWith('iphone') && /\biphone\b/.test(t)) {
    key = `iphone ${key}`;
  }

  if (key.startsWith('iphone')) {
    if (!t.includes('iphone')) return false;
    const compactT = t.replace(/\s+/g, '');
    const compactK = key.replace(/\s+/g, '');
    if (!t.includes(key) && !compactT.includes(compactK)) return false;

    if (/^iphone \d+$/i.test(key)) {
      const n = key.replace(/iphone\s+/i, '');
      if (new RegExp(`iphone\\s*${n}\\s*(plus|pro|maxi|mini|air)`, 'i').test(t)) return false;
    }
    if (/^iphone \d+ pro$/i.test(key) && /iphone\s*\d+\s*pro\s*max/i.test(t)) return false;
    if (/^iphone \d+ plus$/i.test(key) && /iphone\s*\d+\s*pro/i.test(t)) return false;
    if (key === 'iphone x') {
      if (/iphone\s*x[sr]|iphone\s*xs\s*max|iphone\s*x\s*max/i.test(t)) return false;
    }
    return true;
  }

  return t.includes(key);
}

function partMatches(title, partKind) {
  if (!partKind || partKind === 'any') return true;
  const def = PART_BY_KIND[partKind];
  if (!def) return true;
  const t = String(title || '');
  if (def.rejectRx && def.rejectRx.test(t)) return false;
  if (def.titleRx && !def.titleRx.test(t)) return false;
  return true;
}

function queryTokens(query) {
  const aliases = {
    крышка: ['крышка', 'крышк', 'корпус'],
    крышку: ['крышка', 'крышк', 'корпус'],
    корпус: ['корпус', 'крышка', 'крышк'],
    акб: ['акб', 'аккумулятор', 'батаре'],
    аккумулятор: ['акб', 'аккумулятор', 'батаре'],
    дисплей: ['дисплей', 'экран', 'oled', 'lcd'],
    экран: ['дисплей', 'экран'],
    шлейф: ['шлейф'],
    шлейфа: ['шлейф'],
    динамик: ['динамик', 'звонок'],
    микрофон: ['микрофон'],
    кнопка: ['кнопк'],
    кнопки: ['кнопк'],
    вибро: ['вибро', 'taptic'],
    скотч: ['скотч', 'проклейк'],
    проклейка: ['скотч', 'проклейк'],
    антенна: ['антенн'],
    тачскрин: ['тачскрин', 'тач'],
  };
  const ignore = new Set(['для', 'и', 'на', 'apple', 'samsung', 'xiaomi', 'the', 'a']);
  return String(query || '')
    .toLowerCase()
    .split(/[\s,/|+]+/)
    .filter((t) => t.length >= 2 && !ignore.has(t))
    .map((t) => aliases[t] || [t]);
}

/** Require model (if known) + part (if known) + at least one query token family. */
function isRelevantOffer(offer, { partKind, model, modelKey, query, minPrice = 0 } = {}) {
  const title = String(offer?.title || '');
  if (!title) return false;
  if (minPrice > 0 && offer.price != null && offer.price < minPrice) return false;

  const mKey = modelKey || normalizeModelKey('', model);
  if (mKey && !modelMatches(title, mKey)) return false;
  if (partKind && partKind !== 'any' && !partMatches(title, partKind)) return false;

  // When part is unknown, still require query tokens (prevents dumping whole podbor)
  const families = queryTokens(query);
  if (families.length) {
    const t = title.toLowerCase();
    const needed = families.filter((fam) => {
      const f0 = fam[0];
      if (mKey && (mKey.includes(f0) || f0 === 'iphone')) return false;
      if (/^\d+$/.test(f0)) return false;
      if (['pro', 'max', 'plus', 'mini', 'air'].includes(f0)) return false;
      return true;
    });
    if (needed.length) {
      const hit = needed.some((fam) => fam.some((v) => t.includes(v)));
      if (!hit) return false;
    } else if (!partKind || partKind === 'any') {
      // only model in query — keep model-filtered list (already applied)
    }
  }
  return true;
}

function filterRelevant(offers, opts = {}) {
  const list = (offers || []).filter((o) => isRelevantOffer(o, opts));
  const mKey = opts.modelKey || normalizeModelKey('', opts.model);
  list.sort((a, b) => {
    const as = a.inStock === true ? 0 : a.inStock === false ? 2 : 1;
    const bs = b.inStock === true ? 0 : b.inStock === false ? 2 : 1;
    if (as !== bs) return as - bs;
    return (a.price ?? 9e9) - (b.price ?? 9e9);
  });
  if (mKey) {
    list.sort((a, b) => {
      const ae = String(a.title).toLowerCase().includes(mKey) ? 0 : 1;
      const be = String(b.title).toLowerCase().includes(mKey) ? 0 : 1;
      if (ae !== be) return ae - be;
      return (a.price ?? 9e9) - (b.price ?? 9e9);
    });
  }
  return list;
}

function taggsmCategoryPath(partKind) {
  return PART_BY_KIND[partKind]?.taggsmPath || '';
}

module.exports = {
  PART_DEFS,
  PART_BY_KIND,
  detectPartKind,
  normalizeModelKey,
  modelMatches,
  partMatches,
  isRelevantOffer,
  filterRelevant,
  queryTokens,
  taggsmCategoryPath,
};
