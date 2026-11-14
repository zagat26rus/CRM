export type OrderPartLine = {
  id?: number
  itemId: number
  itemName: string
  sku?: string
  quantity: number
  purchasePrice: number
  salePrice: number
}

export type InventoryPickItem = {
  id: number
  name: string
  sku?: string
  quantity: number
  purchasePrice: number
  salePrice: number
}

type OrderNotifyInput = {
  clientName: string
  phone: string
  orderId?: number
  brand?: string
  model?: string
  status: string
  companyName?: string
  telegram?: string
  whatsapp?: string
  email?: string
}

const STATUS_TEMPLATE_KEY: Record<string, string> = {
  Готов: 'ready',
  'В работе': 'in_progress',
  'Ждет запчасти': 'waiting_parts',
  Диагностика: 'diagnostics',
}

export function buildOrderMessage(template: string, order: OrderNotifyInput) {
  const device = [order.brand, order.model].filter(Boolean).join(' ') || 'устройство'
  const firstName = (order.clientName || 'Клиент').split(' ')[0]
  return template
    .replace(/\{имя\}/gi, firstName)
    .replace(/\{клиент\}/gi, order.clientName || 'Клиент')
    .replace(/\{номер\}/gi, order.orderId ? String(order.orderId) : '—')
    .replace(/\{устройство\}/gi, device)
    .replace(/\{статус\}/gi, order.status)
    .replace(/\{компания\}/gi, order.companyName || 'FixNet')
    .replace(/\{телефон\}/gi, order.phone || '')
}

export function pickTemplateForStatus(status: string, templates: Record<string, string>) {
  const key = STATUS_TEMPLATE_KEY[status] || 'default'
  return templates[key] || templates.default || 'Здравствуйте, {имя}! Заказ #{номер}: {устройство}. {компания}'
}

export function openWhatsApp(phone: string, whatsapp: string | undefined, text: string) {
  const digits = String(whatsapp || phone || '').replace(/\D/g, '')
  if (!digits) return false
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank')
  return true
}

export function openTelegram(telegram: string | undefined, text: string) {
  const tg = String(telegram || '').replace('@', '').trim()
  if (!tg) return false
  window.open(`https://t.me/${tg}?text=${encodeURIComponent(text)}`, '_blank')
  return true
}

export function openSms(phone: string, text: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return false
  window.open(`sms:+${digits}?body=${encodeURIComponent(text)}`, '_blank')
  return true
}
