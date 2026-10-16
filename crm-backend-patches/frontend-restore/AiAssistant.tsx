import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'
import { useToast } from '../utils'

type Mode = 'diagnosis' | 'parts'
type Message = { id?: number; role: 'user' | 'assistant'; content: string }

function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <div className='whitespace-pre-wrap break-words'>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target='_blank' rel='noreferrer' className='link break-all'>
            {part}
          </a>
        ) : <span key={i}>{part}</span>
      )}
    </div>
  )
}

export default function AiAssistant() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [mode, setMode] = useState<Mode>('diagnosis')
  const [threadId, setThreadId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetch('/ai/agent/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setConfigured(Boolean(data?.configured)))
      .catch(() => setConfigured(false))
  }, [])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, messages, sending])

  function reset(nextMode = mode) {
    setMode(nextMode)
    setThreadId('')
    setMessages([])
    setInput('')
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    try {
      const res = await apiFetch('/ai/agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode,
          ...(threadId ? { threadId } : {}),
          context: { page: window.location.pathname },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'ИИ не ответил')
      setThreadId(data.threadId)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message.content }])
    } catch (error: any) {
      const text = error?.message || 'Ошибка ИИ'
      toast.push(text)
      setMessages((prev) => [...prev, { role: 'assistant', content: `Ошибка: ${text}` }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          type='button'
          className='fixed right-3 lg:right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-5 z-[39] w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-primary text-black shadow-soft font-bold touch-manipulation'
          onClick={() => setOpen(true)}
          aria-label='Открыть ИИ-ассистента'
          title='ИИ-ассистент'
        >
          ИИ
        </button>
      )}

      {open && (
        <section
          className='fixed z-[46] left-2 right-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:left-auto lg:right-5 lg:bottom-5 lg:w-[26rem] h-[min(70dvh,38rem)] rounded-2xl border border-border bg-bg shadow-soft flex flex-col overflow-hidden'
          aria-label='ИИ-ассистент'
        >
          <header className='p-3 border-b border-border bg-surface flex items-center justify-between gap-2'>
            <div className='min-w-0'>
              <div className='font-semibold'>ИИ-ассистент DeepSeek</div>
              <div className='text-xs text-muted truncate'>
                {mode === 'diagnosis' ? 'Диагностика по симптомам' : 'Поиск запчастей у поставщиков'}
              </div>
            </div>
            <div className='flex gap-1 shrink-0'>
              <button className='btn ghost icon' onClick={() => reset()} aria-label='Новый диалог' title='Новый диалог'>+</button>
              <button className='btn ghost icon' onClick={() => setOpen(false)} aria-label='Закрыть'>×</button>
            </div>
          </header>

          <div className='p-2 border-b border-border grid grid-cols-2 gap-2'>
            <button type='button' className={`btn ${mode === 'diagnosis' ? '' : 'secondary'} text-sm`} onClick={() => reset('diagnosis')}>
              Диагностика
            </button>
            <button type='button' className={`btn ${mode === 'parts' ? '' : 'secondary'} text-sm`} onClick={() => reset('parts')}>
              Запчасти
            </button>
          </div>

          <div className='flex-1 min-h-0 overflow-y-auto p-3 space-y-3'>
            {configured === false && (
              <div className='text-sm border border-warning/50 rounded-xl p-3'>
                DeepSeek пока не настроен. В «Запчасти ИИ» → «Настройки поиска» сохраните API-ключ.
              </div>
            )}
            {messages.length === 0 && (
              <div className='text-sm text-muted'>
                {mode === 'diagnosis'
                  ? 'Подробно опишите устройство и симптомы: после чего возникло, включается ли, есть ли нагрев, звуки и следы жидкости.'
                  : 'Напишите деталь, бренд и модель. Агент опросит подключённых поставщиков и сравнит реальные предложения.'}
              </div>
            )}
            {messages.map((message, i) => (
              <div
                key={`${message.role}-${i}`}
                className={`rounded-xl p-3 text-sm ${message.role === 'user' ? 'ml-6 bg-primary text-black' : 'mr-3 bg-surface border border-border'}`}
              >
                <RichText text={message.content} />
              </div>
            ))}
            {sending && <div className='text-sm text-muted'>DeepSeek анализирует…</div>}
            <div ref={endRef} />
          </div>

          <form className='p-2 border-t border-border bg-surface' onSubmit={send}>
            <textarea
              className='textarea min-h-[68px] max-h-32 resize-none'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'diagnosis' ? 'Опишите неисправность…' : 'Какая запчасть нужна…'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button className='btn w-full mt-2' disabled={sending || input.trim().length < 2}>
              {sending ? 'Анализ…' : 'Отправить'}
            </button>
          </form>
        </section>
      )}
    </>
  )
}
