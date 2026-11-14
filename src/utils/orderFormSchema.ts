export type OrderCustomFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multiselect'

export type StandardOrderFieldKey =
  | 'client'
  | 'phone'
  | 'email'
  | 'status'
  | 'device'
  | 'color'
  | 'imei'
  | 'serialNumber'
  | 'equipment'
  | 'devicePassword'
  | 'clientAddress'
  | 'pricing'
  | 'managerName'
  | 'executorName'
  | 'dueAt'
  | 'isUrgent'
  | 'receiverNotes'
  | 'description'

export type StandardOrderFieldDefinition = {
  key: StandardOrderFieldKey
  label: string
  locked?: boolean
  allowRequired?: boolean
}

export type OrderCustomField = {
  id: string
  label: string
  type: OrderCustomFieldType
  visible: boolean
  required: boolean
  options: string[]
  placeholder: string
}

export type OrderFormSchema = {
  standard: Record<StandardOrderFieldKey, { visible: boolean; required: boolean }>
  custom: OrderCustomField[]
}

export type OrderCustomFieldValue = {
  id: string
  label: string
  type: OrderCustomFieldType
  value: string | boolean | string[]
}

export const STANDARD_ORDER_FIELDS: StandardOrderFieldDefinition[] = [
  { key: 'client', label: 'ФИО клиента', locked: true },
  { key: 'phone', label: 'Телефон', locked: true },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Статус', allowRequired: false },
  { key: 'device', label: 'Устройство и неисправность', locked: true },
  { key: 'color', label: 'Цвет' },
  { key: 'imei', label: 'IMEI' },
  { key: 'serialNumber', label: 'Серийный номер' },
  { key: 'equipment', label: 'Комплектация' },
  { key: 'devicePassword', label: 'Пароль / код устройства' },
  { key: 'clientAddress', label: 'Адрес клиента' },
  { key: 'pricing', label: 'Стоимость и оплата', allowRequired: false },
  { key: 'managerName', label: 'Менеджер' },
  { key: 'executorName', label: 'Исполнитель' },
  { key: 'dueAt', label: 'Срок готовности' },
  { key: 'isUrgent', label: 'Срочный заказ', allowRequired: false },
  { key: 'receiverNotes', label: 'Заметки приёмщика' },
  { key: 'description', label: 'Дополнительное описание' },
]

export const CUSTOM_FIELD_TYPE_LABELS: Record<OrderCustomFieldType, string> = {
  text: 'Текст',
  textarea: 'Большой текст',
  select: 'Выпадающий список',
  radio: 'Один вариант',
  checkbox: 'Галочка',
  multiselect: 'Несколько вариантов',
}

export function defaultOrderFormSchema(): OrderFormSchema {
  return {
    standard: Object.fromEntries(
      STANDARD_ORDER_FIELDS.map((field) => [
        field.key,
        { visible: true, required: Boolean(field.locked) },
      ]),
    ) as OrderFormSchema['standard'],
    custom: [],
  }
}

export function normalizeOrderFormSchema(raw: any): OrderFormSchema {
  const fallback = defaultOrderFormSchema()
  const standard = { ...fallback.standard }
  for (const field of STANDARD_ORDER_FIELDS) {
    const value = raw?.standard?.[field.key]
    standard[field.key] = {
      visible: field.locked ? true : value?.visible !== false,
      required: field.locked
        ? true
        : field.allowRequired === false
          ? false
          : Boolean(value?.required),
    }
  }
  const seen = new Set<string>()
  const custom = (Array.isArray(raw?.custom) ? raw.custom : [])
    .map((field: any): OrderCustomField | null => {
      const id = String(field?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
      const label = String(field?.label || '').trim().slice(0, 100)
      const type = String(field?.type || 'text') as OrderCustomFieldType
      if (!id || !label || seen.has(id) || !CUSTOM_FIELD_TYPE_LABELS[type]) return null
      seen.add(id)
      return {
        id,
        label,
        type,
        visible: field.visible !== false,
        required: Boolean(field.required),
        options: Array.isArray(field.options)
          ? field.options.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 50)
          : [],
        placeholder: String(field.placeholder || '').slice(0, 160),
      }
    })
    .filter(Boolean) as OrderCustomField[]
  return { standard, custom }
}

export function customFieldValuesToRecord(values?: OrderCustomFieldValue[] | Record<string, any>) {
  if (!values) return {} as Record<string, any>
  if (!Array.isArray(values)) return { ...values }
  return Object.fromEntries(values.map((row) => [row.id, row.value]))
}

function hasValue(value: any) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return value
  return String(value ?? '').trim().length > 0
}

export function findMissingOrderFormField(
  schema: OrderFormSchema,
  values: Record<string, any>,
  customValues: Record<string, any>,
) {
  const standardValue: Partial<Record<StandardOrderFieldKey, any>> = {
    client: values.client,
    phone: values.phone,
    email: values.email,
    status: values.status,
    device: values.problem,
    color: values.color,
    imei: values.imei,
    serialNumber: values.serialNumber,
    equipment: values.equipment,
    devicePassword: values.devicePassword,
    clientAddress: values.clientAddress,
    managerName: values.managerName,
    executorName: values.executorName,
    dueAt: values.dueAt,
    receiverNotes: values.receiverNotes,
    description: values.description,
  }
  for (const field of STANDARD_ORDER_FIELDS) {
    const config = schema.standard[field.key]
    if (config.visible && config.required && !hasValue(standardValue[field.key])) {
      return field.label
    }
  }
  for (const field of schema.custom) {
    if (field.visible && field.required && !hasValue(customValues[field.id])) return field.label
  }
  return ''
}

