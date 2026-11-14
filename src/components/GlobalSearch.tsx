import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'

type SearchOrder = { id: number; client: string; phone: string; status: string; brand?: string; model?: string }
type SearchClient = { id: number; name: string; phone: string; email?: string }

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<SearchOrder[]>([])
  const [clients, setClients] = useState<SearchClient[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setOrders([])
      setClients([])
      setOpen(false)
      return
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(`/search?q=${encodeURIComponent(q.trim())}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        setOrders(data.orders || [])
        setClients(data.clients || [])
        setOpen(true)
      } catch {
        setOrders([])
        setClients([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [q])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const hasResults = orders.length > 0 || clients.length > 0

  return (
    <div ref={wrapRef} className='relative hidden md:block'>
      <input
        placeholder='Поиск заказов и клиентов…'
        className='input w-48 lg:w-72'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
      />
      {open && (
        <div className='absolute right-0 top-full mt-2 w-80 lg:w-96 max-h-96 overflow-auto bg-bg border border-border rounded-xl shadow-soft z-50'>
          {loading ? (
            <div className='p-4 text-sm text-muted'>Поиск…</div>
          ) : !hasResults ? (
            <div className='p-4 text-sm text-muted'>Ничего не найдено</div>
          ) : (
            <div className='py-2'>
              {orders.length > 0 && (
                <div>
                  <div className='px-3 py-1 text-xs text-muted uppercase tracking-wide'>Заказы</div>
                  {orders.map((o) => (
                    <button
                      key={`o-${o.id}`}
                      type='button'
                      className='w-full text-left px-3 py-2 hover:bg-surface/60 transition'
                      onClick={() => {
                        setOpen(false)
                        setQ('')
                        navigate(`/orders?open=${o.id}`)
                      }}
                    >
                      <div className='text-sm font-medium'>#{o.id} · {o.client || 'Без имени'}</div>
                      <div className='text-xs text-muted'>
                        {o.phone} · {o.status}
                        {o.brand || o.model ? ` · ${[o.brand, o.model].filter(Boolean).join(' ')}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {clients.length > 0 && (
                <div>
                  <div className='px-3 py-1 text-xs text-muted uppercase tracking-wide'>Клиенты</div>
                  {clients.map((c) => (
                    <button
                      key={`c-${c.id}`}
                      type='button'
                      className='w-full text-left px-3 py-2 hover:bg-surface/60 transition'
                      onClick={() => {
                        setOpen(false)
                        setQ('')
                        navigate(`/clients?open=${c.id}`)
                      }}
                    >
                      <div className='text-sm font-medium'>{c.name}</div>
                      <div className='text-xs text-muted'>{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
