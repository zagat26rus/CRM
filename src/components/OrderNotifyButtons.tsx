import { useMemo } from 'react'
import { useAuth } from '../auth'
import { useToast } from '../utils'
import { useOrderStatuses } from '../hooks/useCompanySettings'
import {
  buildOrderMessage,
  openSms,
  openTelegram,
  openWhatsApp,
  pickTemplateForStatus,
} from '../utils/notifyClient'

type Props = {
  client: string
  phone: string
  orderId?: number
  brand?: string
  model?: string
  status: string
  telegram?: string
  whatsapp?: string
  email?: string
}

export default function OrderNotifyButtons(props: Props) {
  const auth = useAuth()
  const toast = useToast()
  const { settings } = useOrderStatuses()

  const message = useMemo(() => {
    const tpl = pickTemplateForStatus(props.status, settings?.notificationTemplates || {})
    return buildOrderMessage(tpl, {
      ...props,
      companyName: auth.company?.name,
    })
  }, [props, settings, auth.company?.name])

  function copyText() {
    void navigator.clipboard.writeText(message)
    toast.push('Текст скопирован')
  }

  return (
    <div className='md:col-span-2 border border-border rounded-xl p-4 space-y-3'>
      <div className='font-semibold text-sm'>Уведомить клиента</div>
      <p className='text-xs text-muted whitespace-pre-wrap bg-surface/40 rounded-lg p-3'>{message}</p>
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          className='btn secondary text-sm'
          onClick={() => {
            if (!openWhatsApp(props.phone, props.whatsapp, message)) toast.push('Нет номера для WhatsApp')
          }}
        >
          WhatsApp
        </button>
        <button
          type='button'
          className='btn secondary text-sm'
          onClick={() => {
            if (!openTelegram(props.telegram, message)) toast.push('У клиента не указан Telegram')
          }}
        >
          Telegram
        </button>
        <button
          type='button'
          className='btn secondary text-sm'
          onClick={() => {
            if (!openSms(props.phone, message)) toast.push('Нет номера телефона')
          }}
        >
          SMS
        </button>
        <button type='button' className='btn ghost text-sm' onClick={copyText}>
          Копировать
        </button>
      </div>
    </div>
  )
}
