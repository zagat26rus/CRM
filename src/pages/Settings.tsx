import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useAuth } from '../auth'
import { useToast } from '../utils'
import { apiFetch } from '../api'
import IntegrationsModal from './IntegrationsModal'
import InvoiceTemplatesModal from './InvoiceTemplatesModal'
import TelegramBotModal from './TelegramBotModal'
import { invalidateCompanySettingsCache } from '../hooks/useCompanySettings'
import { ORDER_STATUSES as DEFAULT_STATUSES } from '../utils/orderStatuses'

type UserRow = {
  id: number
  companyId: number
  name: string
  email: string
  phone?: string
  role: 'owner' | 'admin' | 'director' | 'master'
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

type InviteRow = {
  id: number
  companyId: number
  email: string | null
  role: 'admin' | 'director' | 'master'
  expiresAt: string
  usedAt: string | null
}

export default function Settings() {
  const auth = useAuth()
  const toast = useToast()
  const [panel, setPanel] = useState<null | 'company' | 'profile' | 'staff' | 'integrations' | 'telegram' | 'invoices' | 'orders'>(null)

  const sections = [
    { title: 'Компания', items: ['Общее', 'Сотрудники', 'Ваш профиль'] },
    { title: 'Заказы', items: ['Статусы'] },
    { title: 'Платежи', items: ['Методы оплаты'] },
    { title: 'Документы', items: ['Шаблоны квитанций'] },
    { title: 'Интеграции', items: ['Telegram-бот', 'API и Webhook'] }
  ]

  const openPanel = (item: string) => {
    if (item === 'Общее') return setPanel('company')
    if (item === 'Ваш профиль') return setPanel('profile')
    if (item === 'Сотрудники') return setPanel('staff')
    if (item === 'Telegram-бот') return setPanel('telegram')
    if (item === 'API и Webhook') return setPanel('integrations')
    if (item === 'Шаблоны квитанций') return setPanel('invoices')
    if (item === 'Статусы') return setPanel('orders')
    if (item === 'Методы оплаты') return toast.push('Список методов: карта, наличные, перевод, онлайн — настраивается в платежах')
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Настройки</h1>
          <div className='text-sm text-muted mt-1'>Компания, доступы, приглашения</div>
        </div>
      </div>

      <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {sections.map((s) => (
          <div key={s.title} className='card'>
            <div className='card-inner'>
              <div className='font-semibold mb-3'>{s.title}</div>
              <div className='grid gap-2'>
                {s.items.map((i) => (
                  <button key={i} className='btn secondary justify-start' onClick={() => openPanel(i)}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {panel === 'company' && <CompanyModal onClose={() => setPanel(null)} />}

      {panel === 'profile' && <ProfileModal onClose={() => setPanel(null)} />}

      {panel === 'staff' && <StaffModal onClose={() => setPanel(null)} />}
      {panel === 'integrations' && <IntegrationsModal onClose={() => setPanel(null)} />}
      {panel === 'telegram' && <TelegramBotModal onClose={() => setPanel(null)} />}
      {panel === 'invoices' && <InvoiceTemplatesModal onClose={() => setPanel(null)} />}
      {panel === 'orders' && <OrderSettingsModal onClose={() => setPanel(null)} />}
    </div>
  )
}

function OrderSettingsModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const toast = useToast()
  const canEdit = ['owner', 'admin'].includes(auth.user?.role || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statuses, setStatuses] = useState<string[]>([...DEFAULT_STATUSES])
  const [newStatus, setNewStatus] = useState('')
  const [warrantyDaysDefault, setWarrantyDaysDefault] = useState(90)
  const [templates, setTemplates] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiFetch('/company/settings')
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки')
        setStatuses(data.orderStatuses || [...DEFAULT_STATUSES])
        setWarrantyDaysDefault(Number(data.warrantyDaysDefault) || 90)
        setTemplates(data.notificationTemplates || {})
      } catch (e: any) {
        toast.push(e?.message || 'Не удалось загрузить настройки')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save() {
    if (!canEdit) return toast.push('Недостаточно прав')
    setSaving(true)
    try {
      const res = await apiFetch('/company/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatuses: statuses, notificationTemplates: templates, warrantyDaysDefault }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка сохранения')
      invalidateCompanySettingsCache()
      toast.push('Настройки заказов сохранены')
      onClose()
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  function addStatus() {
    const s = newStatus.trim()
    if (!s) return
    if (statuses.includes(s)) return toast.push('Такой статус уже есть')
    setStatuses((prev) => [...prev, s])
    setNewStatus('')
  }

  return (
    <Modal title='Статусы и уведомления' onClose={onClose}>
      {loading ? (
        <div className='text-muted py-8 text-center'>Загрузка…</div>
      ) : (
        <div className='space-y-6'>
          <div>
            <div className='font-semibold mb-2'>Статусы заказов</div>
            <div className='flex flex-wrap gap-2 mb-3'>
              {statuses.map((s) => (
                <span key={s} className='inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-sm'>
                  {s}
                  {canEdit && statuses.length > 2 && (
                    <button type='button' className='text-danger text-xs' onClick={() => setStatuses((prev) => prev.filter((x) => x !== s))}>×</button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <div className='flex gap-2'>
                <input className='input flex-1' value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder='Новый статус' />
                <button type='button' className='btn secondary' onClick={addStatus}>Добавить</button>
              </div>
            )}
          </div>

          <div>
            <div className='font-semibold mb-2'>Срок гарантии по умолчанию (дней)</div>
            <input type='number' className='input w-32' min={1} value={warrantyDaysDefault} disabled={!canEdit} onChange={(e) => setWarrantyDaysDefault(Number(e.target.value) || 90)} />
          </div>

          <div className='space-y-3'>
            <div className='font-semibold'>Шаблоны сообщений клиенту</div>
            <p className='text-xs text-muted'>Переменные: {'{имя}'}, {'{номер}'}, {'{устройство}'}, {'{статус}'}, {'{компания}'}</p>
            {[
              ['ready', 'Статус «Готов»'],
              ['in_progress', 'В работе'],
              ['waiting_parts', 'Ждёт запчасти'],
              ['diagnostics', 'Диагностика'],
              ['default', 'По умолчанию'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className='label text-xs'>{label}</label>
                <textarea
                  className='textarea text-sm'
                  rows={2}
                  disabled={!canEdit}
                  value={templates[key] || ''}
                  onChange={(e) => setTemplates((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {canEdit && (
            <button type='button' className='btn' onClick={save} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const toast = useToast()
  const [name, setName] = useState(auth.user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function saveProfile() {
    const trimmed = name.trim()
    if (!trimmed) return toast.push('Введите имя')
    setSavingProfile(true)
    try {
      const res = await apiFetch('/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка сохранения')
      useAuth.setState({ user: data.user })
      toast.push('Профиль обновлён')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сохранить профиль')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword) return toast.push('Заполните оба поля пароля')
    if (newPassword.length < 6) return toast.push('Новый пароль — минимум 6 символов')
    setSavingPassword(true)
    try {
      const res = await apiFetch('/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка смены пароля')
      setCurrentPassword('')
      setNewPassword('')
      toast.push('Пароль изменён')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сменить пароль')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <Modal title='Ваш профиль' onClose={onClose}>
      <div className='space-y-6'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <label className='label'>Имя</label>
            <input className='input' value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className='label'>Email</div>
            <div className='p-3 bg-bg border border-border rounded-xl text-muted'>{auth.user?.email || '—'}</div>
          </div>
          <div>
            <div className='label'>Роль</div>
            <div className='p-3 bg-bg border border-border rounded-xl text-muted'>{auth.user?.role || '—'}</div>
          </div>
        </div>
        <button className='btn' onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? 'Сохранение…' : 'Сохранить имя'}
        </button>

        <div className='border-t border-border pt-5 space-y-4'>
          <div className='font-semibold'>Смена пароля</div>
          <div>
            <label className='label'>Текущий пароль</label>
            <input type='password' className='input' value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className='label'>Новый пароль</label>
            <input type='password' className='input' value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <button className='btn secondary' onClick={savePassword} disabled={savingPassword}>
            {savingPassword ? 'Сохранение…' : 'Сменить пароль'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CompanyModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const toast = useToast()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [name, setName] = useState('')
  const [inn, setInn] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  
  const isOwner = auth.user?.role === 'owner'

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await apiFetch('/company')
      if (!res.ok) throw new Error('Ошибка загрузки данных компании')
      const data = await res.json()
      setName(data.name || '')
      setInn(data.inn || '')
      setCity(data.city || '')
      setAddress(data.address || '')
    } catch (e: any) {
      toast.push(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!isOwner) return
    if (!name.trim()) return toast.push('Название компании обязательно')
    
    try {
      setSaving(true)
      const res = await apiFetch('/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, inn, city, address })
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка сохранения')
      }
      toast.push('Данные обновлены')
    } catch (e: any) {
      toast.push(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title='Компания' onClose={onClose}>
      <div className='space-y-4'>
        {loading ? (
          <div className='text-center py-10 text-muted'>Загрузка...</div>
        ) : (
          <>
            <div className='grid grid-cols-1 gap-4'>
              <div>
                <label className='label'>Название</label>
                <input 
                  className='input' 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  disabled={!isOwner}
                />
              </div>
              <div>
                <label className='label'>ИНН</label>
                <input 
                  className='input' 
                  value={inn} 
                  onChange={e => setInn(e.target.value)}
                  disabled={!isOwner}
                  placeholder='Не обязательно'
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='label'>Город</label>
                  <input 
                    className='input' 
                    value={city} 
                    onChange={e => setCity(e.target.value)}
                    disabled={!isOwner}
                  />
                </div>
                <div>
                  <label className='label'>Адрес</label>
                  <input 
                    className='input' 
                    value={address} 
                    onChange={e => setAddress(e.target.value)}
                    disabled={!isOwner}
                  />
                </div>
              </div>
            </div>
            
            {isOwner ? (
              <div className='flex justify-end pt-2'>
                <button className='btn' onClick={save} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            ) : (
              <div className='text-muted text-sm'>
                Только владелец может менять реквизиты компании.
              </div>
            )}
            
            <div className='pt-4 border-t border-border mt-4'>
               <div className='text-xs text-muted'>ID компании: {auth.company?.id}</div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function StaffModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<'users' | 'invites'>('users')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [users, setUsers] = useState<UserRow[]>([])

  const [loadingInvites, setLoadingInvites] = useState(true)
  const [invites, setInvites] = useState<InviteRow[]>([])

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'director' | 'master'>('master')
  const [inviteDays, setInviteDays] = useState('7')
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [inviteUrlById, setInviteUrlById] = useState<Record<number, string>>({})

  const canManageRoles = useMemo(() => auth.user?.role === 'owner' || auth.user?.role === 'admin', [auth.user?.role])
  const canCreateInvites = canManageRoles

  useEffect(() => {
    loadUsers()
    loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadUsers() {
    try {
      setLoadingUsers(true)
      const res = await apiFetch('/users')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки пользователей')
      setUsers(Array.isArray(data) ? data : [])
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось загрузить сотрудников')
    } finally {
      setLoadingUsers(false)
    }
  }

  async function loadInvites() {
    try {
      setLoadingInvites(true)
      const res = await apiFetch('/invites')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки приглашений')
      setInvites(Array.isArray(data) ? data : [])
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось загрузить приглашения')
    } finally {
      setLoadingInvites(false)
    }
  }

  async function changeRole(userId: number, role: 'admin' | 'director' | 'master') {
    try {
      const res = await apiFetch(`/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка смены роли')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.role } : u)))
      toast.push('Роль обновлена')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сменить роль')
    }
  }

  async function toggleActive(userId: number, isActive: boolean) {
    if (!canManageRoles) return toast.push('Недостаточно прав')
    const label = isActive ? 'разблокировать' : 'заблокировать'
    if (!confirm(`${isActive ? 'Разблокировать' : 'Заблокировать'} пользователя?`)) return
    try {
      const res = await apiFetch(`/users/${userId}/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка: не удалось ${label}`)
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: data.isActive } : u)))
      toast.push(isActive ? 'Пользователь разблокирован' : 'Пользователь заблокирован')
    } catch (e: any) {
      toast.push(e?.message || `Не удалось ${label}`)
    }
  }

  async function createInvite() {
    if (!canCreateInvites) return toast.push('Недостаточно прав')
    setCreatingInvite(true)
    setCreatedInviteUrl(null)
    try {
      const res = await apiFetch('/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim() || null,
          role: inviteRole,
          expiresInDays: Number(inviteDays) || 7
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка создания приглашения')
      setCreatedInviteUrl(data.url)
      toast.push('Приглашение создано')
      await loadInvites()
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось создать приглашение')
    } finally {
      setCreatingInvite(false)
    }
  }

  async function revokeInvite(id: number) {
    if (!canCreateInvites) return toast.push('Недостаточно прав')
    if (!confirm('Отозвать приглашение?')) return
    try {
      const res = await apiFetch(`/invites/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as any)?.error || 'Ошибка отзыва приглашения')
      setInvites((prev) => prev.filter((i) => i.id !== id))
      toast.push('Приглашение отозвано')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось отозвать приглашение')
    }
  }

  async function getInviteLink(id: number) {
    if (!canCreateInvites) return toast.push('Недостаточно прав')
    try {
      const res = await apiFetch(`/invites/${id}/link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка получения ссылки')
      const url = String(data.url || '')
      if (!url) throw new Error('Ссылка не получена')
      setInviteUrlById((prev) => ({ ...prev, [id]: url }))
      await copy(url)
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось получить ссылку')
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.push('Ссылка скопирована')
    } catch {
      toast.push('Не удалось скопировать')
    }
  }

  return (
    <Modal title='Сотрудники' onClose={onClose}>
      <div className='space-y-5'>
        <div className='flex gap-2'>
          <button className={'btn secondary ' + (tab === 'users' ? 'border-primary text-primary' : '')} onClick={() => setTab('users')}>
            Пользователи
          </button>
          <button className={'btn secondary ' + (tab === 'invites' ? 'border-primary text-primary' : '')} onClick={() => setTab('invites')}>
            Приглашения
          </button>
        </div>

        {tab === 'users' && (
          <div className='space-y-3'>
            <div className='text-sm text-muted'>Управление ролями доступно владельцу и администратору.</div>
            <div className='card overflow-hidden'>
              <div className='overflow-auto'>
                <table className='table min-w-[900px]'>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Email</th>
                      <th>Роль</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={5} className='py-10 text-center text-muted'>Загрузка…</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className='py-10 text-center text-muted'>Пользователей нет</td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id}>
                          <td className='font-medium'>{u.name}</td>
                          <td className='text-muted'>{u.email}</td>
                          <td>
                            {u.role === 'owner' ? (
                              <span className='text-sm'>owner</span>
                            ) : (
                              <Select
                                className='select'
                                value={u.role}
                                disabled={!canManageRoles}
                                onChange={(e) => changeRole(u.id, e.target.value as any)}
                              >
                                <option value='admin'>admin</option>
                                <option value='director'>director</option>
                                <option value='master'>master</option>
                              </Select>
                            )}
                          </td>
                          <td>
                            <span className={u.isActive ? 'text-success text-sm' : 'text-danger text-sm'}>
                              {u.isActive ? 'Активен' : 'Заблокирован'}
                            </span>
                          </td>
                          <td className='text-right text-sm'>
                            {u.id === auth.user?.id ? (
                              <span className='text-muted'>Вы</span>
                            ) : u.role !== 'owner' && canManageRoles ? (
                              <button
                                className='btn ghost text-xs px-2 py-1'
                                onClick={() => toggleActive(u.id, !u.isActive)}
                              >
                                {u.isActive ? 'Заблокировать' : 'Разблокировать'}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'invites' && (
          <div className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='md:col-span-2'>
                <label className='label'>Email (необязательно)</label>
                <input className='input' value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder='Если указать, приглашение будет привязано к email' />
              </div>
              <div>
                <label className='label'>Роль</label>
                <Select className='select' value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} disabled={!canCreateInvites}>
                  <option value='master'>master</option>
                  <option value='director'>director</option>
                  <option value='admin'>admin</option>
                </Select>
              </div>
              <div>
                <label className='label'>Срок (дней)</label>
                <Select className='select' value={inviteDays} onChange={(e) => setInviteDays(e.target.value)} disabled={!canCreateInvites}>
                  <option value='1'>1</option>
                  <option value='3'>3</option>
                  <option value='7'>7</option>
                  <option value='14'>14</option>
                  <option value='30'>30</option>
                </Select>
              </div>
              <div className='md:col-span-2 flex gap-2'>
                <button className='btn' onClick={createInvite} disabled={!canCreateInvites || creatingInvite}>
                  {creatingInvite ? 'Создание…' : 'Создать приглашение'}
                </button>
                {createdInviteUrl && (
                  <button className='btn secondary' onClick={() => copy(createdInviteUrl)}>
                    Скопировать ссылку
                  </button>
                )}
              </div>
              {createdInviteUrl && (
                <div className='md:col-span-2'>
                  <div className='label'>Ссылка</div>
                  <div className='p-3 bg-bg border border-border rounded-xl text-sm break-all'>{createdInviteUrl}</div>
                </div>
              )}
            </div>

            <div className='card overflow-hidden'>
              <div className='p-4 border-b border-border bg-surface'>
                <div className='font-semibold'>Список приглашений</div>
              </div>
              <div className='overflow-auto'>
                <table className='table min-w-[900px]'>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Роль</th>
                      <th>Истекает</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingInvites ? (
                      <tr>
                        <td colSpan={6} className='py-10 text-center text-muted'>Загрузка…</td>
                      </tr>
                    ) : invites.length === 0 ? (
                      <tr>
                        <td colSpan={6} className='py-10 text-center text-muted'>Приглашений нет</td>
                      </tr>
                    ) : (
                      invites.map((i) => (
                        <tr key={i.id}>
                          <td className='text-muted'>#{i.id}</td>
                          <td>{i.email || '—'}</td>
                          <td>{i.role}</td>
                          <td className='text-muted'>{new Date(i.expiresAt).toLocaleString('ru-RU')}</td>
                          <td className='text-muted'>{i.usedAt ? 'Использовано' : 'Активно'}</td>
                          <td className='text-right'>
                            {!i.usedAt && canCreateInvites ? (
                              <div className='flex justify-end gap-2'>
                                <button className='btn secondary' onClick={() => getInviteLink(i.id)}>
                                  Ссылка
                                </button>
                                <button className='btn secondary' onClick={() => revokeInvite(i.id)}>
                                  Отозвать
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
