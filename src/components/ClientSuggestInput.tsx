import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { apiFetch } from '../api'

export type ClientSuggestItem = {
  id: number
  name: string
  phone: string
  email?: string
  totalOrders?: number
  totalSpent?: number
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect: (client: ClientSuggestItem) => void
  mode?: 'name' | 'phone'
  placeholder?: string
  className?: string
  formatPhone?: (phone: string) => string
  disabled?: boolean
  minChars?: number
}

function formatPhoneDefault(phone: string) {
  if (!phone) return ''
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('8') && cleaned.length === 11) cleaned = '7' + cleaned.slice(1)
  if (cleaned.startsWith('9') && cleaned.length === 10) cleaned = '7' + cleaned
  if (cleaned.length === 11 && cleaned.startsWith('7')) {
    return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`
  }
  return phone
}

/**
 * Поле с живыми подсказками существующих клиентов (портал, как у Select/ComboInput).
 */
export default function ClientSuggestInput({
  value,
  onChange,
  onSelect,
  mode = 'name',
  placeholder,
  className,
  formatPhone = formatPhoneDefault,
  disabled,
  minChars = 2,
}: Props) {
  const listId = useId().replace(/:/g, '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ClientSuggestItem[]>([])
  const [menuPos, setMenuPos] = useState<{
    left: number
    top?: number
    bottom?: number
    width: number
    maxHeight: number
  } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const reqRef = useRef(0)

  const updatePos = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 4
    const maxMenuHeight = 280
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 320) - 8)),
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      width: Math.max(rect.width, Math.min(320, window.innerWidth - 16)),
      maxHeight: Math.max(120, openUp ? Math.min(maxMenuHeight, spaceAbove) : Math.min(maxMenuHeight, spaceBelow)),
    })
  }, [])

  const search = useCallback(
    async (raw: string) => {
      const q = raw.trim()
      const digits = q.replace(/\D/g, '')
      const enough = mode === 'phone' ? digits.length >= Math.max(3, minChars) || q.length >= minChars + 2 : q.length >= minChars
      if (!enough) {
        setItems([])
        setLoading(false)
        return
      }

      const reqId = ++reqRef.current
      setLoading(true)
      try {
        const res = await apiFetch(`/clients/search?q=${encodeURIComponent(q)}&limit=8`)
        if (!res.ok) {
          if (reqId === reqRef.current) setItems([])
          return
        }
        const data = await res.json()
        if (reqId === reqRef.current) setItems(Array.isArray(data) ? data : [])
      } catch {
        if (reqId === reqRef.current) setItems([])
      } finally {
        if (reqId === reqRef.current) setLoading(false)
      }
    },
    [minChars, mode]
  )

  const scheduleSearch = useCallback(
    (raw: string) => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        void search(raw)
      }, 220)
    },
    [search]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const onLayout = () => updatePos()
    window.addEventListener('scroll', onLayout, true)
    window.addEventListener('resize', onLayout)
    return () => {
      window.removeEventListener('scroll', onLayout, true)
      window.removeEventListener('resize', onLayout)
    }
  }, [open, updatePos, items.length, loading])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showMenu = open && !disabled && menuPos && (loading || items.length > 0 || value.trim().length >= minChars)

  const menu = showMenu
    ? createPortal(
        <div
          ref={menuRef}
          id={listId}
          className='fixed z-[9999] rounded-xl border border-border bg-surface shadow-soft overflow-hidden'
          style={{
            left: menuPos!.left,
            top: menuPos!.top,
            bottom: menuPos!.bottom,
            width: menuPos!.width,
            maxWidth: 'min(calc(100vw - 1rem), 24rem)',
          }}
          role='listbox'
        >
          <div className='px-3 py-2 text-[11px] uppercase tracking-wide text-muted border-b border-border/70 bg-bg/40'>
            {loading ? 'Ищем клиентов…' : items.length ? 'Похожие клиенты' : 'Никого не нашли'}
          </div>
          <ul className='overflow-auto py-1' style={{ maxHeight: menuPos!.maxHeight }}>
            {loading && items.length === 0 ? (
              <li className='px-4 py-3 text-sm text-muted'>Поиск…</li>
            ) : null}
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type='button'
                  role='option'
                  className='w-full text-left px-4 py-2.5 text-sm transition border-b border-border/60 last:border-b-0 hover:bg-bg/70 active:bg-primary/10'
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(c)
                    setOpen(false)
                    setItems([])
                  }}
                >
                  <div className='font-medium truncate'>{c.name || 'Без имени'}</div>
                  <div className='text-xs text-muted mt-0.5 truncate'>
                    {formatPhone(c.phone)}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                  {(c.totalOrders != null || c.totalSpent != null) && (
                    <div className='text-[11px] text-muted mt-1'>
                      {Number(c.totalOrders || 0)} зак.
                      {c.totalSpent != null ? ` · ${Number(c.totalSpent || 0).toLocaleString('ru-RU')} ₽` : ''}
                    </div>
                  )}
                </button>
              </li>
            ))}
            {!loading && items.length === 0 && value.trim().length >= minChars ? (
              <li className='px-4 py-3 text-sm text-muted'>Можно продолжить ввод вручную</li>
            ) : null}
          </ul>
        </div>,
        document.body
      )
    : null

  return (
    <div ref={wrapRef} className='relative'>
      <input
        ref={inputRef}
        className={clsx('input', className)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete='off'
        inputMode={mode === 'phone' ? 'tel' : 'text'}
        role='combobox'
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete='list'
        onFocus={() => {
          if (disabled) return
          setOpen(true)
          updatePos()
          if (value.trim()) scheduleSearch(value)
        }}
        onClick={() => {
          if (disabled) return
          setOpen(true)
          updatePos()
        }}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          setOpen(true)
          updatePos()
          scheduleSearch(next)
        }}
      />
      {menu}
    </div>
  )
}
