import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth'

type Partner = {
  id: number
  name: string
  city?: string
  inn?: string
}

type ThreadItem = {
  id: number
  partner: Partner
  lastMessage: {
    id: number
    body: string
    createdAt: string
    isMine: boolean
    senderName: string
  } | null
  unreadCount: number
}

type ChatMessage = {
  id: number
  body: string
  createdAt: string
  isMine: boolean
  senderName: string
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export default function Chat() {
  const auth = useAuth()
  const [partners, setPartners] = useState<Partner[]>([])
  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [activePartner, setActivePartner] = useState<Partner | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [partnerSearch, setPartnerSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  async function loadPartners() {
    const res = await apiFetch('/chat/partners')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки партнёров')
    setPartners(Array.isArray(data.partners) ? data.partners : [])
  }

  async function loadThreads() {
    const res = await apiFetch('/chat/threads')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки чатов')
    setThreads(Array.isArray(data.threads) ? data.threads : [])
  }

  async function loadAll() {
    try {
      setLoading(true)
      await Promise.all([loadPartners(), loadThreads()])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function openPartnerChat(partner: Partner) {
    try {
      setLoadingMessages(true)
      const res = await apiFetch('/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerCompanyId: partner.id })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Не удалось открыть чат')
      setActiveThreadId(data.id)
      setActivePartner(data.partner || partner)
      await loadMessages(data.id)
      await loadThreads()
    } catch (e: any) {
      alert(e?.message || 'Ошибка открытия чата')
    } finally {
      setLoadingMessages(false)
    }
  }

  async function openThread(thread: ThreadItem) {
    setActiveThreadId(thread.id)
    setActivePartner(thread.partner)
    await loadMessages(thread.id)
  }

  async function loadMessages(threadId: number) {
    try {
      setLoadingMessages(true)
      const res = await apiFetch(`/chat/threads/${threadId}/messages`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки сообщений')
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      if (data.thread?.partner) setActivePartner(data.thread.partner)
      await loadThreads()
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMessages(false)
    }
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!text || !activeThreadId || sending) return
    try {
      setSending(true)
      const res = await apiFetch(`/chat/threads/${activeThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Не удалось отправить')
      setDraft('')
      setMessages((prev) => [...prev, data])
      await loadThreads()
    } catch (e: any) {
      alert(e?.message || 'Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (!activeThreadId) return
    const timer = setInterval(() => {
      void loadMessages(activeThreadId)
    }, 5000)
    return () => clearInterval(timer)
  }, [activeThreadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeThreadId])

  const filteredPartners = partners.filter((p) => {
    const q = partnerSearch.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q) ||
      (p.inn || '').toLowerCase().includes(q)
    )
  })

  const totalUnread = threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold'>Чат</h1>
          <p className='text-sm text-muted mt-1'>
            Переписка с другими сервисными центрами в сети FixNet CRM
            {auth.company?.name ? ` • ${auth.company.name}` : ''}
          </p>
        </div>
        {totalUnread > 0 && (
          <span className='text-xs px-2 py-1 rounded-full bg-primary/15 text-primary'>
            Непрочитанных: {totalUnread}
          </span>
        )}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]'>
        <div className='lg:col-span-4 card overflow-hidden flex flex-col min-h-[320px]'>
          <div className='card-inner border-b border-border space-y-3'>
            <div className='font-semibold'>Диалоги</div>
            <input
              className='input'
              placeholder='Поиск партнёра...'
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
            />
          </div>

          <div className='flex-1 overflow-auto'>
            {loading ? (
              <div className='p-4 text-sm text-muted'>Загрузка...</div>
            ) : (
              <>
                {threads.length > 0 && (
                  <div className='p-2 space-y-1 border-b border-border'>
                    <div className='px-2 py-1 text-xs text-muted uppercase tracking-wide'>Недавние</div>
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        type='button'
                        onClick={() => openThread(t)}
                        className={`w-full text-left px-3 py-2 rounded-xl transition ${
                          activeThreadId === t.id ? 'bg-primary/15 text-primary' : 'hover:bg-surface'
                        }`}
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='font-medium truncate'>{t.partner.name}</span>
                          {t.unreadCount > 0 && (
                            <span className='text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-black font-semibold'>
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                        {t.lastMessage && (
                          <div className='text-xs text-muted truncate mt-0.5'>
                            {t.lastMessage.isMine ? 'Вы: ' : ''}
                            {t.lastMessage.body}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className='p-2 space-y-1'>
                  <div className='px-2 py-1 text-xs text-muted uppercase tracking-wide'>Партнёры CRM</div>
                  {filteredPartners.length === 0 ? (
                    <div className='px-3 py-4 text-sm text-muted'>Других компаний пока нет</div>
                  ) : (
                    filteredPartners.map((p) => (
                      <button
                        key={p.id}
                        type='button'
                        onClick={() => openPartnerChat(p)}
                        className='w-full text-left px-3 py-2 rounded-xl hover:bg-surface transition'
                      >
                        <div className='font-medium truncate'>{p.name}</div>
                        <div className='text-xs text-muted truncate'>
                          {[p.city, p.inn ? `ИНН ${p.inn}` : ''].filter(Boolean).join(' • ') || 'Сервисный центр'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className='lg:col-span-8 card overflow-hidden flex flex-col min-h-[420px]'>
          {!activeThreadId ? (
            <div className='flex-1 flex items-center justify-center text-muted text-sm p-8 text-center'>
              Выберите партнёра слева, чтобы начать переписку
            </div>
          ) : (
            <>
              <div className='card-inner border-b border-border'>
                <div className='font-semibold'>{activePartner?.name || 'Чат'}</div>
                {activePartner?.city && <div className='text-xs text-muted mt-0.5'>{activePartner.city}</div>}
              </div>

              <div className='flex-1 overflow-auto p-4 space-y-3 bg-bg/40'>
                {loadingMessages && messages.length === 0 ? (
                  <div className='text-sm text-muted'>Загрузка сообщений...</div>
                ) : messages.length === 0 ? (
                  <div className='text-sm text-muted text-center py-10'>Напишите первое сообщение партнёру</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          m.isMine
                            ? 'bg-primary text-black rounded-br-md'
                            : 'bg-surface border border-border rounded-bl-md'
                        }`}
                      >
                        {!m.isMine && m.senderName && (
                          <div className='text-[11px] opacity-70 mb-1'>{m.senderName}</div>
                        )}
                        <div>{m.body}</div>
                        <div className={`text-[10px] mt-1 ${m.isMine ? 'text-black/60' : 'text-muted'}`}>
                          {formatTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className='card-inner border-t border-border'>
                <div className='flex gap-2'>
                  <textarea
                    className='textarea flex-1 min-h-[44px] max-h-32'
                    rows={2}
                    placeholder='Сообщение...'
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendMessage()
                      }
                    }}
                  />
                  <button
                    type='button'
                    className='btn self-end'
                    onClick={() => sendMessage()}
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? '...' : 'Отправить'}
                  </button>
                </div>
                <p className='text-[11px] text-muted mt-2'>Enter — отправить, Shift+Enter — новая строка</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
