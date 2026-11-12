const { ORDER_STATUSES: DEFAULT_ORDER_STATUSES } = require('../constants/orderStatuses');
const {
  DEFAULT_CLIENT_SMS,
  normalizeClientSms,
  mergeClientSmsPatch,
} = require('./smsService');

const DEFAULT_NOTIFICATION_TEMPLATES = {
  ready: 'Здравствуйте, {имя}! Устройство {устройство} готово к выдаче. Заказ #{номер}. Отслеживание: {ссылка}. {компания}',
  in_progress: 'Здравствуйте, {имя}! Заказ #{номер} ({устройство}) в работе. Отслеживание: {ссылка}. {компания}',
  waiting_parts: 'Здравствуйте, {имя}! По заказу #{номер} ожидаем запчасти. Отслеживание: {ссылка}. {компания}',
  diagnostics: 'Здравствуйте, {имя}! Заказ #{номер} на диагностике. Отслеживание: {ссылка}. {компания}',
  default: 'Здравствуйте, {имя}! Заказ #{номер}: {устройство}, статус — {статус}. Отслеживание: {ссылка}. {компания}',
};

const DEFAULT_AI_PARTS_SEARCH = {
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

const DEFAULT_DAILY_DIGEST = {
  enabled: true,
  lowStockThreshold: 2,
};

function normalizeDailyDigest(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: src.enabled !== undefined ? Boolean(src.enabled) : true,
    lowStockThreshold: Math.max(
      0,
      Number(src.lowStockThreshold) || DEFAULT_DAILY_DIGEST.lowStockThreshold,
    ),
  };
}

const DEFAULT_SETTINGS = {
  orderStatuses: [...DEFAULT_ORDER_STATUSES],
  notificationTemplates: { ...DEFAULT_NOTIFICATION_TEMPLATES },
  warrantyDaysDefault: 90,
  aiPartsSearch: { ...DEFAULT_AI_PARTS_SEARCH, llm: { ...DEFAULT_AI_PARTS_SEARCH.llm } },
  clientSms: { ...DEFAULT_CLIENT_SMS },
  dailyDigest: { ...DEFAULT_DAILY_DIGEST },
};

function parseSettingsJson(raw) {
  try {
    const v = JSON.parse(String(raw || '{}'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function normalizeAiPartsSearch(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const llmSrc = src.llm && typeof src.llm === 'object' ? src.llm : {};
  return {
    enabledSuppliers: Array.isArray(src.enabledSuppliers) && src.enabledSuppliers.length
      ? src.enabledSuppliers.map(String)
      : [...DEFAULT_AI_PARTS_SEARCH.enabledSuppliers],
    cacheTtlMinutes: Math.min(Math.max(Number(src.cacheTtlMinutes) || 30, 5), 240),
    llm: {
      provider: String(llmSrc.provider || DEFAULT_AI_PARTS_SEARCH.llm.provider),
      baseUrl: String(llmSrc.baseUrl || DEFAULT_AI_PARTS_SEARCH.llm.baseUrl),
      model: String(llmSrc.model || DEFAULT_AI_PARTS_SEARCH.llm.model),
      apiKey: String(llmSrc.apiKey || ''),
    },
    greensparkCookie: String(src.greensparkCookie || ''),
    libertiCookie: String(src.libertiCookie || ''),
    siriustCookie: String(src.siriustCookie || ''),
  };
}

function getCompanySettings(db, companyId) {
  const row = db.prepare('SELECT settingsJson FROM companies WHERE id = ?').get(companyId);
  const parsed = parseSettingsJson(row?.settingsJson);
  const orderStatuses = Array.isArray(parsed.orderStatuses) && parsed.orderStatuses.length > 0
    ? parsed.orderStatuses.map((s) => String(s).trim()).filter(Boolean)
    : [...DEFAULT_SETTINGS.orderStatuses];

  const notificationTemplates = {
    ...DEFAULT_SETTINGS.notificationTemplates,
    ...(parsed.notificationTemplates && typeof parsed.notificationTemplates === 'object' ? parsed.notificationTemplates : {}),
  };

  const warrantyDaysDefault = Number(parsed.warrantyDaysDefault) > 0
    ? Number(parsed.warrantyDaysDefault)
    : DEFAULT_SETTINGS.warrantyDaysDefault;

  const aiPartsSearch = normalizeAiPartsSearch(parsed.aiPartsSearch);
  const clientSms = normalizeClientSms(parsed.clientSms);
  const dailyDigest = normalizeDailyDigest(parsed.dailyDigest);

  return {
    orderStatuses,
    notificationTemplates,
    warrantyDaysDefault,
    aiPartsSearch,
    clientSms,
    dailyDigest,
  };
}

function mergeCompanySettings(db, companyId, patch) {
  const row = db.prepare('SELECT settingsJson FROM companies WHERE id = ?').get(companyId);
  const parsed = parseSettingsJson(row?.settingsJson);
  const current = getCompanySettings(db, companyId);
  const next = {
    ...parsed,
    orderStatuses: patch.orderStatuses ?? current.orderStatuses,
    notificationTemplates: patch.notificationTemplates ?? current.notificationTemplates,
    warrantyDaysDefault: patch.warrantyDaysDefault ?? current.warrantyDaysDefault,
    aiPartsSearch: patch.aiPartsSearch
      ? normalizeAiPartsSearch({
          ...current.aiPartsSearch,
          ...patch.aiPartsSearch,
          llm: { ...current.aiPartsSearch.llm, ...(patch.aiPartsSearch.llm || {}) },
        })
      : current.aiPartsSearch,
    clientSms: patch.clientSms
      ? mergeClientSmsPatch(current.clientSms, patch.clientSms)
      : current.clientSms,
    dailyDigest: patch.dailyDigest
      ? normalizeDailyDigest({ ...current.dailyDigest, ...patch.dailyDigest })
      : current.dailyDigest,
  };
  const { getCurrentTime } = require('../config/database');
  const now = getCurrentTime();
  db.prepare('UPDATE companies SET settingsJson = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(next),
    now,
    companyId
  );
  return getCompanySettings(db, companyId);
}

function getOrderStatusesForCompany(db, companyId) {
  return getCompanySettings(db, companyId).orderStatuses;
}

function isAllowedOrderStatus(db, companyId, status) {
  const list = getOrderStatusesForCompany(db, companyId);
  return list.includes(status) || ['Закрыт', 'Отказ'].includes(status);
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_NOTIFICATION_TEMPLATES,
  DEFAULT_AI_PARTS_SEARCH,
  DEFAULT_CLIENT_SMS,
  DEFAULT_DAILY_DIGEST,
  normalizeDailyDigest,
  getCompanySettings,
  mergeCompanySettings,
  getOrderStatusesForCompany,
  isAllowedOrderStatus,
};
