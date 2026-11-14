export type DocumentTypeId =
  | 'repair_receipt'
  | 'cash_receipt_kkm'
  | 'cash_receipt'
  | 'torg12'
  | 'material_release'
  | 'upd'
  | 'payment_invoice'
  | 'work_completion_act'
  | 'vat_invoice'
  | 'cash_in_order'
  | 'cash_out_order'
  | 'warranty_card'
  | 'acceptance_act'
  | 'acceptance_warranty'

export type DocumentType = {
  id: DocumentTypeId
  title: string
  description: string
  oneCName: string
  available: boolean
}

export type DocumentCategory = {
  id: string
  title: string
  items: DocumentType[]
}

/** Каталог видов документов по образцу типовых форм 1С */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  {
    id: 'repair',
    title: 'Приём в ремонт',
    items: [
      {
        id: 'repair_receipt',
        title: 'Квитанция приёма в ремонт',
        description: 'Приём устройства, состояние, пожелания клиента, печать на A4',
        oneCName: '1С: квитанция / приёмная накладная',
        available: true
      }
    ]
  },
  {
    id: 'sales',
    title: 'Продажи и касса',
    items: [
      {
        id: 'cash_receipt_kkm',
        title: 'Чек ККМ',
        description: 'Кассовый чек при продаже товара или услуги',
        oneCName: '1С: Чек ККМ',
        available: true
      },
      {
        id: 'cash_receipt',
        title: 'Кассовый чек (без ККТ)',
        description: 'Чек при расчёте без подключённой кассы',
        oneCName: '1С: Чек',
        available: true
      }
    ]
  },
  {
    id: 'warehouse',
    title: 'Склад и отгрузка',
    items: [
      {
        id: 'torg12',
        title: 'Товарная накладная (ТОРГ-12)',
        description: 'Отпуск товаров со склада покупателю',
        oneCName: '1С: Реализация товаров и услуг / ТОРГ-12',
        available: true
      },
      {
        id: 'material_release',
        title: 'Накладная на отпуск материалов',
        description: 'Списание материалов на ремонт или внутренние нужды',
        oneCName: '1С: Требование-накладная',
        available: true
      },
      {
        id: 'upd',
        title: 'Универсальный передаточный документ (УПД)',
        description: 'Передача товаров и оказание услуг в одном документе',
        oneCName: '1С: УПД',
        available: true
      }
    ]
  },
  {
    id: 'settlements',
    title: 'Расчёты с контрагентами',
    items: [
      {
        id: 'payment_invoice',
        title: 'Счёт на оплату',
        description: 'Выставление счёта клиенту за услуги или товары',
        oneCName: '1С: Счёт на оплату покупателю',
        available: true
      },
      {
        id: 'work_completion_act',
        title: 'Акт выполненных работ',
        description: 'Подтверждение оказанных услуг и суммы к оплате',
        oneCName: '1С: Акт об оказании услуг',
        available: true
      },
      {
        id: 'vat_invoice',
        title: 'Счёт-фактура',
        description: 'Налоговый документ при работе с НДС',
        oneCName: '1С: Счёт-фактура выданный',
        available: true
      }
    ]
  },
  {
    id: 'cashdesk',
    title: 'Касса',
    items: [
      {
        id: 'cash_in_order',
        title: 'Приходный кассовый ордер (ПКО)',
        description: 'Поступление наличных в кассу',
        oneCName: '1С: ПКО',
        available: true
      },
      {
        id: 'cash_out_order',
        title: 'Расходный кассовый ордер (РКО)',
        description: 'Выдача наличных из кассы',
        oneCName: '1С: РКО',
        available: true
      }
    ]
  },
  {
    id: 'service',
    title: 'Гарантия и сервис',
    items: [
      {
        id: 'warranty_card',
        title: 'Гарантийный талон',
        description: 'Выдача гарантии после ремонта',
        oneCName: '1С: гарантийный документ',
        available: true
      },
      {
        id: 'acceptance_act',
        title: 'Акт приёма-передачи',
        description: 'Передача устройства клиенту после ремонта',
        oneCName: '1С: акт приёма-передачи',
        available: true
      },
      {
        id: 'acceptance_warranty',
        title: 'Акт и гарантия',
        description: 'Акт приёма-передачи и гарантийный талон в одном документе',
        oneCName: '1С: акт + гарантия',
        available: true
      }
    ]
  }
]

export function findDocumentType(id: DocumentTypeId): DocumentType | undefined {
  for (const cat of DOCUMENT_CATEGORIES) {
    const found = cat.items.find((item) => item.id === id)
    if (found) return found
  }
  return undefined
}

export const DOCUMENT_NUMBER_PREFIXES: Record<DocumentTypeId, string> = {
  repair_receipt: 'КВ',
  cash_receipt_kkm: 'ЧК',
  cash_receipt: 'ЧК',
  torg12: 'ТН',
  material_release: 'МН',
  upd: 'УПД',
  payment_invoice: 'СЧ',
  work_completion_act: 'АВР',
  vat_invoice: 'СФ',
  cash_in_order: 'ПКО',
  cash_out_order: 'РКО',
  warranty_card: 'ГТ',
  acceptance_act: 'АПП',
  acceptance_warranty: 'АПГ'
}

export function todayDocumentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function fallbackDocumentNumber(id: DocumentTypeId): string {
  const year = new Date().getFullYear()
  const prefix = DOCUMENT_NUMBER_PREFIXES[id] || 'ДОК'
  return `${prefix}-${year}-0001`
}
