const ORDER_STATUSES = [
  // Основные — совпадают с сайтом FixNet
  'Создана',
  'Принята',
  // Промежуточные — только CRM; на сайте остаются как «В работе» + этап
  'Диагностика',
  'Ждёт запчасть',
  'Ремонт',
  // Основные
  'В работе',
  'Готово',
  'Выдано',
  // Только CRM
  'Отказ сервиса',
  'Отказ клиента',
  'Закрыт неуспешно',
];

const CLOSED_SUCCESS_STATUSES = ['Выдано', 'Закрыт успешно', 'Закрыт'];
const CANCELLED_STATUSES = ['Отказ сервиса', 'Отказ клиента', 'Отказ', 'Закрыт неуспешно'];
const CLOSED_FAILED_STATUSES = ['Закрыт неуспешно', 'Закрыт не успешно'];

const ALLOWED_STATUSES = [
  ...ORDER_STATUSES,
  // старые названия из прошлых версий
  'Новый',
  'Готов',
  'Ждет запчасти',
  'Закрыт успешно',
  'Закрыт не успешно',
  'Закрыт',
  'Отказ',
];

/** Какой статус сайта и этап соответствуют статусу CRM */
function mapCrmStatusToSite(crmStatus) {
  const s = String(crmStatus || '').trim().toLowerCase().replace(/ё/g, 'е');
  const table = {
    создана: { status: 'created', work_stage: '' },
    новый: { status: 'created', work_stage: '' },
    new: { status: 'created', work_stage: '' },
    created: { status: 'created', work_stage: '' },

    принята: { status: 'accepted', work_stage: '' },
    accepted: { status: 'accepted', work_stage: '' },

    диагностика: { status: 'in_progress', work_stage: 'diagnostics' },
    diagnosis: { status: 'in_progress', work_stage: 'diagnostics' },

    'ждет запчасть': { status: 'in_progress', work_stage: 'waiting_part' },
    'ждет запчасти': { status: 'in_progress', work_stage: 'waiting_part' },
    waiting_parts: { status: 'in_progress', work_stage: 'waiting_part' },
    waiting_part: { status: 'in_progress', work_stage: 'waiting_part' },

    ремонт: { status: 'in_progress', work_stage: 'repairing' },
    repairing: { status: 'in_progress', work_stage: 'repairing' },

    'в работе': { status: 'in_progress', work_stage: 'repairing' },
    in_progress: { status: 'in_progress', work_stage: 'repairing' },

    готово: { status: 'done', work_stage: '' },
    готов: { status: 'done', work_stage: '' },
    ready: { status: 'done', work_stage: '' },
    done: { status: 'done', work_stage: '' },

    выдано: { status: 'issued', work_stage: '' },
    issued: { status: 'issued', work_stage: '' },
    'закрыт успешно': { status: 'issued', work_stage: '' },
    закрыт: { status: 'issued', work_stage: '' },
    completed: { status: 'issued', work_stage: '' },
  };
  return table[s] || null;
}

/** Нормализуем старые названия к каноническим CRM-статусам */
function normalizeCrmStatus(crmStatus) {
  const s = String(crmStatus || '').trim();
  const lower = s.toLowerCase().replace(/ё/g, 'е');
  const aliases = {
    новый: 'Создана',
    new: 'Создана',
    готов: 'Готово',
    ready: 'Готово',
    'ждет запчасти': 'Ждёт запчасть',
    'закрыт успешно': 'Выдано',
    закрыт: 'Выдано',
    'закрыт не успешно': 'Закрыт неуспешно',
  };
  return aliases[lower] || s;
}

module.exports = {
  ORDER_STATUSES,
  CLOSED_SUCCESS_STATUSES,
  CANCELLED_STATUSES,
  CLOSED_FAILED_STATUSES,
  ALLOWED_STATUSES,
  mapCrmStatusToSite,
  normalizeCrmStatus,
};
