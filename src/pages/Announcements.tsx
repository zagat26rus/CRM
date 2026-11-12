import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'

type Announcement = {
  id: number
  title: string
  body: string
  priority: 'low' | 'normal' | 'high'
  targetRoles: string
  pinned: boolean
  expiresAt: string | null
  isActive: boolean
  isRead: boolean
  createdAt: string
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Срочный',
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'Все сотрудники' },
  { value: 'owner', label: 'Владелец' },
  { value: 'admin', label: 'Администратор' },
  { value: 'director', label: 'Директор' },
  { value: 'master', label: 'Мастер' },
]

export default function Announcements() {
  const auth = useAuth()
  const toast = useToast()
  const canManage = ['owner', 'admin', 'director'].includes(auth.user?.role || '')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Announcement[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState({
    title: '',
    body: '',
    priority: 'normal',
    targetRoles: 'all',
    pinned: false,
    expiresAt: '',
    isActive: true,
  })

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch(`/announcements${canManage ? '?all=1' : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setItems(data.announcements || [])
      setUnread(data.unread || 0)
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось загрузить объявления')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({ title: '', body: '', priority: 'normal', targetRoles: 'all', pinned: false, expiresAt: '', isActive: true })
    setOpen(true)
  }

  function openEdit(item: Announcement) {
    setEditing(item)
    setForm({
      title: item.title,
      body: item.body,
      priority: item.priority,
      targetRoles: item.targetRoles,
      pinned: item.pinned,
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : '',
      isActive: item.isActive,
    })
    setOpen(true)
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) return toast.push('Заполните заголовок и текст')
    try {
      const payload = {
        ...form,
        expiresAt: form.expiresAt || null,
      }
      const res = await apiFetch(editing ? `/announcements/${editing.id}` : '/announcements', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      toast.push(editing ? 'Объявление обновлено' : 'Объявление опубликовано')
      setOpen(false)
      void load()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка сохранения')
    }
  }

  async function remove(id: number) {
    if (!confirm('Удалить объявление?')) return
    try {
      const res = await apiFetch(`/announcements/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      toast.push('Удалено')
      void load()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка удаления')
    }
  }

  async function markRead(id: number) {
    await apiFetch(`/announcements/${id}/read`, { method: 'POST' })
    void load()
  }

  async function markAllRead() {
    await apiFetch('/announcements/read-all', { method: 'POST' })
    toast.push('Все объявления отмечены прочитанными')
    void load()
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold'>Объявления</h1>
          <p className='text-sm text-muted mt-1'>Внутренние сообщения для команды{unread > 0 ? ` · непрочитанных: ${unread}` : ''}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {unread > 0 && (
            <button type='button' className='btn secondary' onClick={() => void markAllRead()}>
              Прочитать все
            </button>
          )}
          {canManage && (
            <button type='button' className='btn' onClick={openCreate}>
              Новое объявление
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className='card'><div className='card-inner text-center text-muted py-16'>Загрузка…</div></div>
      ) : items.length === 0 ? (
        <div className='card'><div className='card-inner text-center text-muted py-16'>Объявлений пока нет</div></div>
      ) : (
        <div className='space-y-3'>
          {items.map((item) => (
            <div key={item.id} className={`card ${!item.isRead ? 'border-primary/40' : ''}`}>
              <div className='card-inner'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2 mb-1'>
                      {item.pinned && <span className='tag tag-active text-xs'>Закреплено</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.priority === 'high' ? 'bg-danger/20 text-danger' : item.priority === 'low' ? 'bg-surface text-muted' : 'bg-primary/15 text-primary'}`}>
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                      {!item.isActive && <span className='text-xs text-muted'>Скрыто</span>}
                      {!item.isRead && <span className='text-xs text-primary'>Новое</span>}
                    </div>
                    <h2 className='font-semibold text-lg'>{item.title}</h2>
                    <p className='text-sm text-muted mt-2 whitespace-pre-wrap'>{item.body}</p>
                    <div className='text-xs text-muted mt-3'>
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                      {item.expiresAt ? ` · до ${item.expiresAt.slice(0, 10)}` : ''}
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-2 shrink-0'>
                    {!item.isRead && (
                      <button type='button' className='btn btn-ghost text-sm' onClick={() => void markRead(item.id)}>
                        Прочитано
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button type='button' className='btn secondary text-sm' onClick={() => openEdit(item)}>Изменить</button>
                        <button type='button' className='btn btn-ghost text-sm text-danger' onClick={() => void remove(item.id)}>Удалить</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title={editing ? 'Редактировать объявление' : 'Новое объявление'} onClose={() => setOpen(false)}>
          <div className='space-y-3'>
            <div>
              <label className='label'>Заголовок</label>
              <input className='input' value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className='label'>Текст</label>
              <textarea className='textarea' rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className='grid sm:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Приоритет</label>
                <Select className='select' value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value='low'>Низкий</option>
                  <option value='normal'>Обычный</option>
                  <option value='high'>Срочный</option>
                </Select>
              </div>
              <div>
                <label className='label'>Аудитория</label>
                <Select className='select' value={form.targetRoles} onChange={(e) => setForm({ ...form, targetRoles: e.target.value })}>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className='grid sm:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Действует до</label>
                <input type='date' className='input' value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              <div className='flex flex-col gap-2 justify-end'>
                <label className='flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                  Закрепить сверху
                </label>
                <label className='flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Показывать сотрудникам
                </label>
              </div>
            </div>
            <div className='flex justify-end gap-2 pt-2'>
              <button type='button' className='btn secondary' onClick={() => setOpen(false)}>Отмена</button>
              <button type='button' className='btn' onClick={() => void save()}>Сохранить</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
