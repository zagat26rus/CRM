import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../utils'
import { apiFetch } from '../api'

type Prefs = {
  perms: Record<string, boolean | string>
  notify: Record<string, boolean>
  taskSlots: string[]
  summaryHour: number
}

type Def = { key: string; label: string }

type Me = {
  linked: boolean
  tgUsername?: string
  tgName?: string
  linkedAt?: string
  phone: string
  prefs: Prefs
}

type Status = {
  configured: boolean
  botUsername: string
  api: { state: 'ok' | 'down' | 'unknown'; error: string }
  webhookReady: boolean
  me: Me
  canManage: boolean
}

type StaffRow = {
  id: number
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  linked: boolean
  tgUsername?: string
  tgName?: string
  prefs: Prefs
}

type StaffData = {
  staff: StaffRow[]
  permDefs: Def[]
  notifyDefs: Def[]
  taskSlots: { id: string; name: string }[]
}

type Code = { code: string; expiresAt: string; deepLink: string }

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  director: 'Директор',
  master: 'Мастер'
}

async function readError(res: Response, fallback: string) {
  try {
    const data = await res.json()
    return data.error || fallback
  } catch {
    return fallback
  }
}

function tgLabel(u: { tgUsername?: string; tgName?: string }) {
  if (u.tgUsername) return `@${u.tgUsername}`
  return u.tgName || 'Telegram'
}

export default function TelegramBotModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [staff, setStaff] = useState<StaffData | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState<Code | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'me' | 'staff'>('me')

  useEffect(() => {
    load(true)
  }, [])

  async function load(check = false) {
    try {
      const res = await apiFetch(`/telegram/status${check ? '?check=1' : ''}`)
      if (!res.ok) throw new Error(await readError(res, 'Не удалось загрузить статус бота'))
      const data: Status = await res.json()
      setStatus(data)
      setPhone(data.me.phone || '')
      if (data.canManage) await loadStaff()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  async function loadStaff() {
    const res = await apiFetch('/telegram/staff')
    if (!res.ok) throw new Error(await readError(res, 'Не удалось загрузить сотрудников'))
    setStaff(await res.json())
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const getCode = () =>
    run(async () => {
      const res = await apiFetch('/telegram/link-code', { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось получить код'))
      setCode(await res.json())
    })

  const savePhone = () =>
    run(async () => {
      const res = await apiFetch('/telegram/phone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось сохранить номер'))
      toast.push('Номер сохранён')
      await load()
    })

  const unlinkMe = () =>
    run(async () => {
      if (!confirm('Отвязать Telegram от вашего аккаунта?')) return
      const res = await apiFetch('/telegram/link', { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось отвязать'))
      setCode(null)
      toast.push('Telegram отвязан')
      await load()
    })

  const sendTest = () =>
    run(async () => {
      const res = await apiFetch('/telegram/test', { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось отправить'))
      toast.push('Тестовое сообщение отправлено')
    })

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.push('Скопировано')
    } catch {
      toast.push(text)
    }
  }

  const apiBad = status?.api.state === 'down'

  return (
    <Modal title='Telegram-бот' onClose={onClose}>
      {loading || !status ? (
        <div className='py-10 text-center text-muted'>Загрузка…</div>
      ) : (
        <div className='space-y-4'>
          {!status.configured && (
            <div className='card-inner border border-border rounded-lg text-sm'>
              Бот ещё не подключён на сервере: не задан токен (TELEGRAM_BOT_TOKEN).
            </div>
          )}

          {status.configured && apiBad && (
            <div className='card-inner border border-border rounded-lg text-sm space-y-1'>
              <div className='font-semibold'>Сервер CRM не достучался до Telegram</div>
              <div className='text-muted'>
                Ответы на сообщения в боте работают, но уведомления, загрузка фото и тестовые сообщения не будут
                отправляться, пока не настроен ретранслятор (TELEGRAM_API_BASE).
              </div>
            </div>
          )}

          {status.canManage && (
            <div className='flex gap-2'>
              <button className={`btn ${tab === 'me' ? '' : 'secondary'} flex-1`} onClick={() => setTab('me')}>
                Мой Telegram
              </button>
              <button className={`btn ${tab === 'staff' ? '' : 'secondary'} flex-1`} onClick={() => setTab('staff')}>
                Сотрудники и права
              </button>
            </div>
          )}

          {tab === 'me' && (
            <div className='space-y-4'>
              <div className='text-sm text-muted'>
                Бот @{status.botUsername}: заявки, статусы, фото, задачи, склад и сводка за день прямо в Telegram.
              </div>

              <div className='card-inner border border-border rounded-lg space-y-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='font-semibold'>Привязка</div>
                    <div className='text-sm text-muted'>
                      {status.me.linked ? `Привязан: ${tgLabel(status.me)}` : 'Не привязан'}
                    </div>
                  </div>
                  {status.me.linked && (
                    <div className='flex gap-2 flex-wrap justify-end'>
                      <button className='btn secondary' disabled={busy} onClick={sendTest}>
                        Тест
                      </button>
                      <button className='btn secondary' disabled={busy} onClick={unlinkMe}>
                        Отвязать
                      </button>
                    </div>
                  )}
                </div>

                {!status.me.linked && status.configured && (
                  <div className='space-y-3'>
                    <div className='text-sm'>
                      1. Нажмите «Получить код» и откройте бота по ссылке, либо отправьте боту код вручную.
                      <br />
                      2. Либо сохраните свой номер ниже и в боте нажмите «Поделиться контактом».
                    </div>
                    <button className='btn' disabled={busy} onClick={getCode}>
                      Получить код привязки
                    </button>
                    {code && (
                      <div className='space-y-2'>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <span className='font-mono text-xl tracking-widest'>{code.code}</span>
                          <button className='btn secondary' onClick={() => copy(code.code)}>
                            Копировать
                          </button>
                          <a className='btn' href={code.deepLink} target='_blank' rel='noreferrer'>
                            Открыть в Telegram
                          </a>
                        </div>
                        <div className='text-xs text-muted'>Код действует 15 минут и подходит один раз.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className='card-inner border border-border rounded-lg space-y-2'>
                <label className='label'>Мой телефон (для привязки по контакту)</label>
                <div className='flex gap-2'>
                  <input
                    className='input flex-1'
                    value={phone}
                    placeholder='+7 900 000-00-00'
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <button className='btn' disabled={busy} onClick={savePhone}>
                    Сохранить
                  </button>
                </div>
              </div>

              {status.me.linked && (
                <div className='text-sm text-muted'>
                  Уведомления и доступ настраиваются в боте: Настройки. Администратор может менять права сотрудников
                  на вкладке «Сотрудники и права».
                </div>
              )}
            </div>
          )}

          {tab === 'staff' && status.canManage && staff && (
            <StaffEditor
              data={staff}
              onChanged={loadStaff}
              busy={busy}
              run={run}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

function StaffEditor({
  data,
  onChanged,
  busy,
  run
}: {
  data: StaffData
  onChanged: () => Promise<void>
  busy: boolean
  run: (fn: () => Promise<void>) => Promise<void>
}) {
  const toast = useToast()
  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <div className='space-y-3'>
      <div className='text-sm text-muted'>
        Для каждого сотрудника выберите, что ему доступно в боте и какие уведомления он получает. Сотрудник привязывает
        Telegram сам (код в разделе «Мой Telegram») или по номеру телефона.
      </div>
      {data.staff
        .filter((s) => s.isActive)
        .map((s) => (
          <div key={s.id} className='card-inner border border-border rounded-lg space-y-3'>
            <button
              className='w-full flex items-center justify-between gap-3 text-left touch-manipulation'
              onClick={() => setOpenId(openId === s.id ? null : s.id)}
            >
              <div className='min-w-0'>
                <div className='font-semibold truncate'>{s.name}</div>
                <div className='text-xs text-muted'>
                  {ROLE_LABELS[s.role] || s.role} · {s.linked ? `Telegram: ${tgLabel(s)}` : 'не привязан'}
                </div>
              </div>
              <span className='text-muted'>{openId === s.id ? '▲' : '▼'}</span>
            </button>
            {openId === s.id && (
              <StaffForm
                key={s.id}
                row={s}
                data={data}
                busy={busy}
                run={run}
                onSaved={async () => {
                  await onChanged()
                  toast.push('Сохранено')
                }}
                onChanged={onChanged}
              />
            )}
          </div>
        ))}
    </div>
  )
}

function StaffForm({
  row,
  data,
  busy,
  run,
  onSaved,
  onChanged
}: {
  row: StaffRow
  data: StaffData
  busy: boolean
  run: (fn: () => Promise<void>) => Promise<void>
  onSaved: () => Promise<void>
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [prefs, setPrefs] = useState<Prefs>(row.prefs)
  const [phone, setPhone] = useState(row.phone || '')

  const setPerm = (key: string, value: boolean | string) =>
    setPrefs((p) => ({ ...p, perms: { ...p.perms, [key]: value } }))
  const setNotify = (key: string, value: boolean) =>
    setPrefs((p) => ({ ...p, notify: { ...p.notify, [key]: value } }))
  const toggleSlot = (id: string) =>
    setPrefs((p) => ({
      ...p,
      taskSlots: p.taskSlots.includes(id) ? p.taskSlots.filter((x) => x !== id) : [...p.taskSlots, id]
    }))

  const save = () =>
    run(async () => {
      const res = await apiFetch(`/telegram/staff/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prefs, phone })
      })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось сохранить'))
      await onSaved()
    })

  const unlink = () =>
    run(async () => {
      if (!confirm(`Отвязать Telegram у сотрудника ${row.name}?`)) return
      const res = await apiFetch(`/telegram/staff/${row.id}/link`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось отвязать'))
      toast.push('Telegram отвязан')
      await onChanged()
    })

  const check = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label key={label} className='flex items-start gap-2 text-sm min-h-[32px] cursor-pointer'>
      <input type='checkbox' className='mt-1' checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <label className='label'>Телефон сотрудника</label>
        <input className='input' value={phone} placeholder='+7 900 000-00-00' onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className='space-y-1'>
        <div className='label'>Доступ в боте</div>
        {data.permDefs.map((d) => check(Boolean(prefs.perms[d.key]), (v) => setPerm(d.key, v), d.label))}
        <div className='flex items-center gap-2 text-sm pt-1'>
          <span>Какие заявки видит:</span>
          <select
            className='input'
            value={prefs.perms.orders_scope === 'all' ? 'all' : 'mine'}
            onChange={(e) => setPerm('orders_scope', e.target.value)}
          >
            <option value='all'>Все заявки</option>
            <option value='mine'>Только свои</option>
          </select>
        </div>
      </div>

      <div className='space-y-1'>
        <div className='label'>Уведомления</div>
        {data.notifyDefs.map((d) => check(Boolean(prefs.notify[d.key]), (v) => setNotify(d.key, v), d.label))}
        <div className='flex items-center gap-2 text-sm pt-1'>
          <span>Час вечерней сводки:</span>
          <select
            className='input'
            value={prefs.summaryHour}
            onChange={(e) => setPrefs((p) => ({ ...p, summaryHour: Number(e.target.value) }))}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className='space-y-1'>
        <div className='label'>Задачи, назначенные на роли</div>
        <div className='text-xs text-muted'>Сотрудник получает задачи, исполнитель которых выбран ниже.</div>
        {data.taskSlots.map((s) => check(prefs.taskSlots.includes(s.id), () => toggleSlot(s.id), s.name))}
      </div>

      <div className='flex gap-2 flex-wrap'>
        <button className='btn' disabled={busy} onClick={save}>
          Сохранить
        </button>
        {row.linked && (
          <button className='btn secondary' disabled={busy} onClick={unlink}>
            Отвязать Telegram
          </button>
        )}
      </div>
    </div>
  )
}
