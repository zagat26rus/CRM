import type { DocumentTypeId } from './documentTypes'
import type { SaleCategoryId } from './utils/saleCategories'
import { defaultSaleCategoryForDocType } from './utils/saleCategories'

export type DocLine = {
  name: string
  unit: string
  qty: number
  price: number
  supplierCost?: number
  vat?: string
}

export type GenericDocData = {
  client: string
  clientInn: string
  clientKpp: string
  clientAddress: string
  phone: string
  email: string
  supplier: string
  warehouse: string
  basis: string
  purpose: string
  paymentMethod: string
  bankName: string
  bankBik: string
  bankAccount: string
  corrAccount: string
  amount: number
  costAmount: number
  vatRate: string
  vatAmount: number
  total: number
  fromWhom: string
  toWhom: string
  passedBy: string
  issuedByPosition: string
  receivedBy: string
  chiefAccountant: string
  cashier: string
  brand: string
  model: string
  deviceType: string
  serialNumber: string
  imei: string
  warrantyMonths: number
  warrantyTerms: string
  condition: string
  notes: string
  saleCategory: SaleCategoryId
  lines: DocLine[]
}

export type FieldType = 'text' | 'textarea' | 'number' | 'address' | 'select' | 'deviceType' | 'brand' | 'model'

export type DocField = {
  key: keyof GenericDocData
  label: string
  type: FieldType
  required?: boolean
  colSpan?: 1 | 2
  options?: string[]
  placeholder?: string
}

export type DocSection = {
  title: string
  fields?: DocField[]
  showLines?: boolean
}

export type DocSchema = {
  title: string
  printTitle: string
  sections: DocSection[]
  lineColumns?: Array<{ key: keyof DocLine; label: string; width?: string; crmOnly?: boolean }>
}

const PAYMENT_METHODS = ['Наличные', 'Безналичные', 'Карта', 'СБП']

export function emptyLine(): DocLine {
  return { name: '', unit: 'шт', qty: 1, price: 0, supplierCost: 0, vat: 'без НДС' }
}

export function emptyGenericDoc(): GenericDocData {
  return {
    client: '',
    clientInn: '',
    clientKpp: '',
    clientAddress: '',
    phone: '',
    email: '',
    supplier: 'ИП Сторожук Ф.Д.',
    warehouse: 'Основной склад',
    basis: '',
    purpose: '',
    paymentMethod: 'Наличные',
    bankName: '',
    bankBik: '',
    bankAccount: '',
    corrAccount: '',
    amount: 0,
    costAmount: 0,
    vatRate: 'без НДС',
    vatAmount: 0,
    total: 0,
    fromWhom: '',
    toWhom: '',
    passedBy: '',
    issuedByPosition: '',
    receivedBy: '',
    chiefAccountant: '',
    cashier: '',
    brand: '',
    model: '',
    deviceType: 'Смартфон',
    serialNumber: '',
    imei: '',
    warrantyMonths: 3,
    warrantyTerms: 'Гарантия на выполненные работы и установленные запчасти.',
    condition: 'Исправно, без видимых повреждений',
    notes: '',
    saleCategory: 'tech',
    lines: [emptyLine()]
  }
}

const partyFields: DocField[] = [
  { key: 'client', label: 'Контрагент / ФИО', type: 'text', required: true, colSpan: 2 },
  { key: 'clientInn', label: 'ИНН', type: 'text' },
  { key: 'clientKpp', label: 'КПП', type: 'text' },
  { key: 'phone', label: 'Телефон', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'clientAddress', label: 'Адрес', type: 'address', colSpan: 2 }
]

const defaultLineCols = [
  { key: 'name' as const, label: 'Наименование' },
  { key: 'unit' as const, label: 'Ед.' },
  { key: 'qty' as const, label: 'Кол-во' },
  { key: 'price' as const, label: 'Цена' }
]

const salesLineCols = [
  ...defaultLineCols,
  { key: 'supplierCost' as const, label: 'Себестоимость', crmOnly: true }
]

const cashReceiptSignFields: DocField[] = [
  { key: 'issuedByPosition', label: 'Должность (выдал)', type: 'text', placeholder: 'Напр. Продавец-консультант' },
  { key: 'passedBy', label: 'Расшифровка подписи (выдал)', type: 'text', placeholder: 'ФИО сотрудника' },
  { key: 'receivedBy', label: 'Расшифровка подписи (получил)', type: 'text', placeholder: 'По умолчанию — покупатель' },
]

const actWarrantySignFields: DocField[] = [
  { key: 'issuedByPosition', label: 'Должность (выдал)', type: 'text', placeholder: 'Напр. Мастер' },
  { key: 'passedBy', label: 'ФИО (выдал)', type: 'text', placeholder: 'ФИО сотрудника' },
  { key: 'receivedBy', label: 'ФИО клиента (получил)', type: 'text', placeholder: 'По умолчанию — из поля «ФИО клиента»' },
]

export const DOCUMENT_SCHEMAS: Record<DocumentTypeId, DocSchema> = {
  repair_receipt: { title: '', printTitle: '', sections: [] },
  cash_receipt_kkm: {
    title: 'Чек ККМ',
    printTitle: 'КАССОВЫЙ ЧЕК (ККМ)',
    sections: [
      { title: 'Покупатель', fields: [{ key: 'client', label: 'Покупатель', type: 'text', required: true }, { key: 'phone', label: 'Телефон', type: 'text' }] },
      { title: 'Оплата', fields: [{ key: 'paymentMethod', label: 'Способ оплаты', type: 'select', options: PAYMENT_METHODS }, { key: 'cashier', label: 'Кассир', type: 'text' }] },
      { title: 'Позиции', showLines: true },
      { title: 'Подписи', fields: cashReceiptSignFields }
    ],
    lineColumns: salesLineCols
  },
  cash_receipt: {
    title: 'Кассовый чек',
    printTitle: 'КАССОВЫЙ ЧЕК',
    sections: [
      { title: 'Покупатель', fields: [{ key: 'client', label: 'Покупатель', type: 'text', required: true }, { key: 'phone', label: 'Телефон', type: 'text' }] },
      { title: 'Оплата', fields: [{ key: 'paymentMethod', label: 'Способ оплаты', type: 'select', options: PAYMENT_METHODS }] },
      { title: 'Позиции', showLines: true },
      { title: 'Подписи', fields: cashReceiptSignFields }
    ],
    lineColumns: salesLineCols
  },
  torg12: {
    title: 'Товарная накладная ТОРГ-12',
    printTitle: 'ТОВАРНАЯ НАКЛАДНАЯ (ТОРГ-12)',
    sections: [
      { title: 'Покупатель', fields: partyFields },
      { title: 'Отгрузка', fields: [{ key: 'warehouse', label: 'Склад-отправитель', type: 'text' }, { key: 'basis', label: 'Основание', type: 'text', colSpan: 2 }] },
      { title: 'Товары', showLines: true },
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Отпустил', type: 'text' }, { key: 'receivedBy', label: 'Получил', type: 'text' }] }
    ],
    lineColumns: salesLineCols
  },
  material_release: {
    title: 'Требование-накладная',
    printTitle: 'ТРЕБОВАНИЕ-НАКЛАДНАЯ (отпуск материалов)',
    sections: [
      { title: 'Склад', fields: [{ key: 'warehouse', label: 'Со склада', type: 'text' }, { key: 'purpose', label: 'Подразделение / назначение', type: 'text', colSpan: 2 }] },
      { title: 'Основание', fields: [{ key: 'basis', label: 'Основание', type: 'text', colSpan: 2 }] },
      { title: 'Материалы', showLines: true },
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Отпустил', type: 'text' }, { key: 'receivedBy', label: 'Получил', type: 'text' }] }
    ],
    lineColumns: salesLineCols
  },
  upd: {
    title: 'УПД',
    printTitle: 'УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ (УПД)',
    sections: [
      { title: 'Покупатель', fields: partyFields },
      { title: 'Условия', fields: [{ key: 'basis', label: 'Основание', type: 'text' }, { key: 'vatRate', label: 'Ставка НДС', type: 'select', options: ['без НДС', '5%', '10%', '20%'] }] },
      { title: 'Товары и услуги', showLines: true },
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Передал', type: 'text' }, { key: 'receivedBy', label: 'Получил', type: 'text' }] }
    ],
    lineColumns: [...salesLineCols, { key: 'vat', label: 'НДС' }]
  },
  payment_invoice: {
    title: 'Счёт на оплату',
    printTitle: 'СЧЁТ НА ОПЛАТУ',
    sections: [
      { title: 'Покупатель', fields: partyFields },
      { title: 'Банковские реквизиты', fields: [
        { key: 'bankName', label: 'Банк', type: 'text', colSpan: 2 },
        { key: 'bankBik', label: 'БИК', type: 'text' },
        { key: 'bankAccount', label: 'Р/с', type: 'text' },
        { key: 'corrAccount', label: 'К/с', type: 'text', colSpan: 2 }
      ]},
      { title: 'Назначение', fields: [{ key: 'purpose', label: 'Назначение платежа', type: 'textarea', colSpan: 2 }] },
      { title: 'Позиции', showLines: true }
    ],
    lineColumns: salesLineCols
  },
  work_completion_act: {
    title: 'Акт выполненных работ',
    printTitle: 'АКТ ОБ ОКАЗАНИИ УСЛУГ',
    sections: [
      { title: 'Заказчик', fields: partyFields },
      { title: 'Основание', fields: [{ key: 'basis', label: 'Основание (договор, заказ)', type: 'text', colSpan: 2 }] },
      { title: 'Выполненные работы', showLines: true },
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Исполнитель', type: 'text' }, { key: 'receivedBy', label: 'Заказчик', type: 'text' }] }
    ],
    lineColumns: [{ key: 'name', label: 'Наименование работ' }, { key: 'unit', label: 'Ед.' }, { key: 'qty', label: 'Кол-во' }, { key: 'price', label: 'Сумма' }, { key: 'supplierCost', label: 'Себестоимость', crmOnly: true }]
  },
  vat_invoice: {
    title: 'Счёт-фактура',
    printTitle: 'СЧЁТ-ФАКТУРА',
    sections: [
      { title: 'Покупатель', fields: partyFields },
      { title: 'НДС', fields: [{ key: 'vatRate', label: 'Ставка НДС', type: 'select', options: ['5%', '10%', '20%'] }, { key: 'vatAmount', label: 'Сумма НДС', type: 'number' }] },
      { title: 'Товары (работы, услуги)', showLines: true },
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Руководитель', type: 'text' }, { key: 'chiefAccountant', label: 'Главный бухгалтер', type: 'text' }] }
    ],
    lineColumns: [...salesLineCols, { key: 'vat', label: 'НДС' }]
  },
  cash_in_order: {
    title: 'Приходный кассовый ордер (ПКО)',
    printTitle: 'ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР (ПКО)',
    sections: [
      { title: 'Платёж', fields: [
        { key: 'fromWhom', label: 'Принято от', type: 'text', required: true, colSpan: 2 },
        { key: 'basis', label: 'Основание', type: 'text', colSpan: 2 },
        { key: 'purpose', label: 'Приложение', type: 'text', colSpan: 2 },
        { key: 'amount', label: 'Сумма прихода, ₽', type: 'number', required: true },
        { key: 'costAmount', label: 'Себестоимость / расходы, ₽', type: 'number' },
        { key: 'paymentMethod', label: 'Вид оплаты', type: 'select', options: PAYMENT_METHODS }
      ]},
      { title: 'Подписи', fields: [{ key: 'cashier', label: 'Кассир', type: 'text' }, { key: 'chiefAccountant', label: 'Главный бухгалтер', type: 'text' }] }
    ]
  },
  cash_out_order: {
    title: 'Расходный кассовый ордер (РКО)',
    printTitle: 'РАСХОДНЫЙ КАССОВЫЙ ОРДЕР (РКО)',
    sections: [
      { title: 'Платёж', fields: [
        { key: 'toWhom', label: 'Выдать', type: 'text', required: true, colSpan: 2 },
        { key: 'basis', label: 'Основание', type: 'text', colSpan: 2 },
        { key: 'amount', label: 'Сумма', type: 'number', required: true },
        { key: 'paymentMethod', label: 'Вид оплаты', type: 'select', options: PAYMENT_METHODS }
      ]},
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Руководитель', type: 'text' }, { key: 'cashier', label: 'Кассир', type: 'text' }, { key: 'receivedBy', label: 'Получил', type: 'text' }] }
    ]
  },
  warranty_card: {
    title: 'Гарантийный талон',
    printTitle: 'ГАРАНТИЙНЫЙ ТАЛОН',
    sections: [
      { title: 'Клиент', fields: [{ key: 'client', label: 'ФИО', type: 'text', required: true }, { key: 'phone', label: 'Телефон', type: 'text' }] },
      { title: 'Устройство', fields: [
        { key: 'deviceType', label: 'Категория / тип', type: 'deviceType' },
        { key: 'brand', label: 'Марка', type: 'brand' },
        { key: 'model', label: 'Модель', type: 'model' },
        { key: 'serialNumber', label: 'Серийный номер', type: 'text' },
        { key: 'imei', label: 'IMEI', type: 'text' }
      ]},
      { title: 'Гарантия', fields: [
        { key: 'warrantyMonths', label: 'Срок гарантии (мес.)', type: 'number' },
        { key: 'warrantyTerms', label: 'Условия гарантии', type: 'textarea', colSpan: 2 }
      ]}
    ]
  },
  acceptance_act: {
    title: 'Акт приёма-передачи',
    printTitle: 'АКТ ПРИЁМА-ПЕРЕДАЧИ',
    sections: [
      { title: 'Клиент', fields: [{ key: 'client', label: 'ФИО', type: 'text', required: true }, { key: 'phone', label: 'Телефон', type: 'text' }] },
      { title: 'Устройство', fields: [
        { key: 'deviceType', label: 'Категория / тип', type: 'deviceType' },
        { key: 'brand', label: 'Марка', type: 'brand' },
        { key: 'model', label: 'Модель', type: 'model' },
        { key: 'serialNumber', label: 'Серийный номер', type: 'text' },
        { key: 'condition', label: 'Состояние при выдаче', type: 'textarea', colSpan: 2 }
      ]},
      { title: 'Подписи', fields: [{ key: 'passedBy', label: 'Передал (исполнитель)', type: 'text' }, { key: 'receivedBy', label: 'Получил (клиент)', type: 'text' }] },
      { title: 'Примечание', fields: [{ key: 'notes', label: 'Примечания', type: 'textarea', colSpan: 2 }] }
    ]
  },
  acceptance_warranty: {
    title: 'Акт и гарантия',
    printTitle: 'АКТ ПРИЁМА-ПЕРЕДАЧИ И ГАРАНТИЙНЫЙ ТАЛОН',
    sections: [
      { title: 'Клиент', fields: [{ key: 'client', label: 'ФИО клиента', type: 'text', required: true }, { key: 'phone', label: 'Телефон', type: 'text' }] },
      { title: 'Устройство', fields: [
        { key: 'deviceType', label: 'Категория / тип', type: 'deviceType' },
        { key: 'brand', label: 'Марка', type: 'brand' },
        { key: 'model', label: 'Модель', type: 'model' },
        { key: 'serialNumber', label: 'Серийный номер', type: 'text' },
        { key: 'condition', label: 'Состояние при выдаче', type: 'textarea', colSpan: 2, placeholder: 'Напр. Исправно, без видимых повреждений' }
      ]},
      { title: 'Гарантия', fields: [
        { key: 'warrantyMonths', label: 'Срок гарантии (мес.)', type: 'number' },
        { key: 'warrantyTerms', label: 'На что предоставляется гарантия', type: 'textarea', colSpan: 2, placeholder: 'заменённый дисплейный модуль' }
      ]},
      { title: 'Подписи', fields: actWarrantySignFields }
    ]
  }
}

export function emptyGenericDocForType(docType?: DocumentTypeId | null): GenericDocData {
  const base = {
    ...emptyGenericDoc(),
    saleCategory: defaultSaleCategoryForDocType(docType),
  }
  if (docType === 'acceptance_warranty') {
    return {
      ...base,
      warrantyTerms: 'выполненные работы и установленные запчасти',
    }
  }
  return base
}

export function calcLinesTotal(lines: DocLine[]): number {
  return lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
}

export function calcLinesCost(lines: DocLine[]): number {
  return lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.supplierCost) || 0), 0)
}

export function calcLinesProfit(lines: DocLine[]): number {
  return calcLinesTotal(lines) - calcLinesCost(lines)
}

export function calcDocTotal(data: GenericDocData): number {
  const lineTotal = calcLinesTotal(data.lines)
  if (lineTotal > 0 || data.lines.some((l) => l.name.trim())) return lineTotal
  return Number(data.amount) || 0
}

export function calcDocCost(data: GenericDocData): number {
  return calcLinesCost(data.lines) + (Number(data.costAmount) || 0)
}

export function calcDocProfit(data: GenericDocData): number {
  return calcDocTotal(data) - calcDocCost(data)
}

export function schemaHasFinance(schema: DocSchema): boolean {
  const hasLineCost = Boolean(schema.lineColumns?.some((c) => c.key === 'supplierCost'))
  const hasAmountCost = schema.sections.some((s) =>
    s.fields?.some((f) => f.key === 'costAmount' || f.key === 'amount')
  )
  return hasLineCost || hasAmountCost
}
