export const ORDER_STATUSES = [
  'Создана',
  'Принята',
  'Диагностика',
  'Ждёт запчасть',
  'Ремонт',
  'В работе',
  'Готово',
  'Выдано',
  'Отказ сервиса',
  'Отказ клиента',
  'Закрыт неуспешно',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const CLOSED_SUCCESS_STATUS = 'Выдано' as const

export const CLOSED_SUCCESS_STATUSES = ['Выдано', 'Закрыт успешно', 'Закрыт'] as const
export const CANCELLED_STATUSES = ['Отказ сервиса', 'Отказ клиента', 'Отказ', 'Закрыт неуспешно'] as const
export const CLOSED_FAILED_STATUSES = ['Закрыт неуспешно', 'Закрыт не успешно'] as const

/** Завершённые / неактивные: выданные, отказы, закрытые */
export const INACTIVE_ORDER_STATUSES = Array.from(
  new Set([
    ...CLOSED_SUCCESS_STATUSES,
    ...CANCELLED_STATUSES,
    ...CLOSED_FAILED_STATUSES,
  ])
)

export function isClosedSuccessStatus(status: string) {
  return (CLOSED_SUCCESS_STATUSES as readonly string[]).includes(status)
}

export function isInactiveOrderStatus(status: string) {
  return INACTIVE_ORDER_STATUSES.includes(status)
}

/** Серые бейджи для завершённых заказов; цвет только у активных стадий */
export function getOrderStatusColor(status: string): string {
  if (isInactiveOrderStatus(status)) {
    return 'bg-bg border border-border text-muted'
  }
  switch (status) {
    case 'Создана':
    case 'Новый':
      return 'bg-bg border border-sky-400 text-sky-400'
    case 'Принята':
      return 'bg-bg border border-indigo-400 text-indigo-400'
    case 'Диагностика':
    case 'Ждёт запчасть':
    case 'Ждет запчасти':
      return 'bg-bg border border-warning text-warning'
    case 'Ремонт':
    case 'В работе':
      return 'bg-bg border border-primary text-primary'
    case 'Готово':
    case 'Готов':
      return 'bg-bg border border-emerald-400 text-emerald-400'
    default:
      return 'bg-bg border border-border text-text'
  }
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  'Создана': '#38bdf8',
  'Новый': '#38bdf8',
  'Принята': '#818cf8',
  'Диагностика': '#f59e0b',
  'Ждёт запчасть': '#f59e0b',
  'Ждет запчасти': '#f59e0b',
  'Ремонт': '#facc15',
  'В работе': '#facc15',
  'Готово': '#34d399',
  'Готов': '#34d399',
  'Выдано': '#94a3b8',
  'Отказ сервиса': '#94a3b8',
  'Отказ клиента': '#94a3b8',
  'Закрыт неуспешно': '#94a3b8',
  'Закрыт не успешно': '#94a3b8',
  'Закрыт успешно': '#94a3b8',
  'Закрыт': '#94a3b8',
  'Отказ': '#94a3b8',
}
