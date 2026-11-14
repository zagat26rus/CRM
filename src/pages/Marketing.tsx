import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'

type Segment = {
  id: string
  label: string
  description: string
  count: number
}

type Client = {
  id: number
  name: string
  phone: string
  email?: string
  telegram?: string
  whatsapp?: string
  totalOrders: number
  totalSpent: number
  lastOrderDate?: string
}

type Campaign = {
  id: number
  name: string
  channel: string
  segment: string
  message: string
  status: string
  recipientCount: number
  sentAt?: string
  createdAt: string
}

const TEMPLATES = [
  { id: 'ready', title: 'Ремонт готов', text: 'Здравствуйте, {имя}! Ваше устройство готово. Сервисный центр ФиксНэт.' },
  { id: 'remind', title: 'Напоминание', text: 'Здравствуйте, {имя}! Давно не виделись. Скидка 10% на следующий ремонт до конца месяца. ФиксНэт.' },
  { id: 'glass', title: 'Защитное стекло', text: 'Здравствуйте, {имя}! Установим защитное стекло со скидкой. ФиксНэт, ул. Мимоз 26/1.' },
]

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  sms: 'SMS',
  email: 'Email',
  other: 'Другое',
}

export default function Marketing() {
  const auth = useAuth()
  const toast = useToast()
  const canManage = ['owner', 'admin', 'director'].includes(auth.user?.role || '')
  const [tab, setTab] = useState<'segments' | 'campaigns'>('segments')
  const [segments, setSegments] = useState<Segment[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null)
  const [segmentClients, setSegmentClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', segment: 'inactive_30', message: '' })
  const [sendResult, setSendResult] = useState<{ clients: Client[]; message: string; channel: string } | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [segRes, campRes] = await Promise.all([apiFetch('/marketing/segments'), apiFetch('/marketing/campaigns')])
      const segData = await segRes.json()
      const campData = await campRes.json()
      setSegments(segData.segments || [])
      setCampaigns(campData.campaigns || [])
    } catch (e) {
      console.error(e)
      toast.push('Ошибка загрузки маркетинга')
    } finally {
      setLoading(false)
    }
  }

  async function loadSegmentClients(segmentId: string) {
    setSelectedSegment(segmentId)
    try {
      const res = await apiFetch(`/marketing/segments/${segmentId}/clients`)
      const data = await res.json()
      setSegmentClients(data.clients || [])
    } catch {
      toast.push('Не удалось загрузить клиентов сегмента')
    }
  }

  function applyTemplate(text: string) {
    setForm((f) => ({ ...f, message: text }))
    setOpen(true)
  }

  async function saveCampaign() {
    if (!form.name.trim() || !form.message.trim()) return toast.push('Заполните название и текст')
    try {
      const res = await apiFetch('/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      toast.push('Кампания сохранена')
      setOpen(false)
      setForm({ name: '', channel: 'whatsapp', segment: 'inactive_30', message: '' })
      void load()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка сохранения')
    }
  }

  async function sendCampaign(id: number) {
    try {
      const res = await apiFetch(`/marketing/campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setSendResult({ clients: data.clients || [], message: data.message, channel: data.channel })
      toast.push(`Кампания отмечена отправленной · ${data.recipientCount} получателей`)
      void load()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка отправки')
    }
  }

  function openMessenger(client: Client, channel: string, message: string) {
    const text = encodeURIComponent(message.replace(/\{имя\}/gi, client.name.split(' ')[0] || client.name))
    const phone = String(client.phone || '').replace(/\D/g, '')
    if (channel === 'whatsapp') {
      const wa = client.whatsapp || phone
      window.open(`https://wa.me/${wa.replace(/\D/g, '')}?text=${text}`, '_blank')
    } else if (channel === 'telegram') {
      const tg = client.telegram?.replace('@', '') || ''
      if (tg) window.open(`https://t.me/${tg}`, '_blank')
      else toast.push('У клиента не указан Telegram')
    } else if (channel === 'email' && client.email) {
      window.open(`mailto:${client.email}?body=${text}`, '_blank')
    } else {
      void navigator.clipboard.writeText(message.replace(/\{имя\}/gi, client.name))
      toast.push('Текст скопирован в буфер обмена')
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold'>Маркетинг</h1>
          <p className='text-sm text-muted mt-1'>Сегменты клиентов и рассылки</p>
        </div>
        {canManage && tab === 'campaigns' && (
          <button type='button' className='btn' onClick={() => setOpen(true)}>Новая кампания</button>
        )}
      </div>

      <div className='flex gap-2 border-b border-border'>
        <button type='button' className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'segments' ? 'border-primary text-primary' : 'border-transparent text-muted'}`} onClick={() => setTab('segments')}>
          Сегменты
        </button>
        <button type='button' className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'campaigns' ? 'border-primary text-primary' : 'border-transparent text-muted'}`} onClick={() => setTab('campaigns')}>
          Кампании
        </button>
      </div>

      {loading ? (
        <div className='card'><div className='card-inner text-center text-muted py-16'>Загрузка…</div></div>
      ) : tab === 'segments' ? (
        <div className='grid lg:grid-cols-2 gap-4'>
          <div className='card'>
            <div className='card-inner space-y-2'>
              <div className='font-semibold mb-2'>Сегменты аудитории</div>
              {segments.map((s) => (
                <button
                  key={s.id}
                  type='button'
                  onClick={() => void loadSegmentClients(s.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${selectedSegment === s.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                >
                  <div className='flex justify-between gap-2'>
                    <span className='font-medium'>{s.label}</span>
                    <span className='text-primary font-semibold tabular-nums'>{s.count}</span>
                  </div>
                  <div className='text-xs text-muted mt-1'>{s.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className='card'>
            <div className='card-inner'>
              <div className='font-semibold mb-3'>Клиенты сегмента</div>
              {!selectedSegment ? (
                <p className='text-muted text-sm'>Выберите сегмент слева</p>
              ) : segmentClients.length === 0 ? (
                <p className='text-muted text-sm'>В сегменте нет клиентов</p>
              ) : (
                <div className='space-y-2 max-h-[28rem] overflow-y-auto'>
                  {segmentClients.map((c) => (
                    <div key={c.id} className='p-3 rounded-lg border border-border text-sm'>
                      <div className='font-medium'>{c.name}</div>
                      <div className='text-muted'>{c.phone}</div>
                      <div className='text-xs text-muted mt-1'>
                        Заказов: {c.totalOrders} · {Math.round(c.totalSpent).toLocaleString('ru-RU')} ₽
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className='card lg:col-span-2'>
            <div className='card-inner'>
              <div className='font-semibold mb-3'>Шаблоны сообщений</div>
              <div className='grid sm:grid-cols-3 gap-3'>
                {TEMPLATES.map((t) => (
                  <button key={t.id} type='button' className='text-left p-3 rounded-lg border border-border hover:border-primary/50 transition' onClick={() => canManage && applyTemplate(t.text)} disabled={!canManage}>
                    <div className='font-medium text-sm'>{t.title}</div>
                    <div className='text-xs text-muted mt-2 line-clamp-3'>{t.text}</div>
                  </button>
                ))}
              </div>
              {!canManage && <p className='text-xs text-muted mt-2'>Создание кампаний доступно администратору</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className='card'>
          <div className='card-inner overflow-x-auto'>
            {campaigns.length === 0 ? (
              <p className='text-muted text-center py-10'>Кампаний пока нет</p>
            ) : (
              <table className='table w-full text-sm'>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Канал</th>
                    <th>Сегмент</th>
                    <th className='text-right'>Получателей</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className='font-medium'>{c.name}</td>
                      <td>{CHANNEL_LABELS[c.channel] || c.channel}</td>
                      <td>{segments.find((s) => s.id === c.segment)?.label || c.segment}</td>
                      <td className='text-right tabular-nums'>{c.recipientCount}</td>
                      <td>{c.status === 'sent' ? 'Отправлена' : 'Черновик'}</td>
                      <td className='text-right'>
                        {canManage && c.status !== 'sent' && (
                          <button type='button' className='btn btn-ghost text-sm' onClick={() => void sendCampaign(c.id)}>
                            Отправить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {open && (
        <Modal title='Новая кампания' onClose={() => setOpen(false)}>
          <div className='space-y-3'>
            <div>
              <label className='label'>Название</label>
              <input className='input' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className='grid sm:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Канал</label>
                <Select className='select' value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className='label'>Сегмент</label>
                <Select className='select' value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.count})</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className='label'>Текст ({'{имя}'} — имя клиента)</label>
              <textarea className='textarea' rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <div className='flex justify-end gap-2'>
              <button type='button' className='btn secondary' onClick={() => setOpen(false)}>Отмена</button>
              <button type='button' className='btn' onClick={() => void saveCampaign()}>Сохранить</button>
            </div>
          </div>
        </Modal>
      )}

      {sendResult && (
        <Modal title='Получатели кампании' onClose={() => setSendResult(null)}>
          <p className='text-sm text-muted mb-3'>Откройте мессенджер для каждого клиента или скопируйте текст.</p>
          <div className='space-y-2 max-h-80 overflow-y-auto'>
            {sendResult.clients.map((c) => (
              <div key={c.id} className='flex items-center justify-between gap-2 p-2 border border-border rounded-lg text-sm'>
                <div>
                  <div className='font-medium'>{c.name}</div>
                  <div className='text-muted'>{c.phone}</div>
                </div>
                <button type='button' className='btn secondary text-sm shrink-0' onClick={() => openMessenger(c, sendResult.channel, sendResult.message)}>
                  Написать
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
