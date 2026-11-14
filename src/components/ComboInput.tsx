import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

type Props = {
  value: string
  onChange: (value: string) => void
  options: string[]
  className?: string
  placeholder?: string
  disabled?: boolean
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={clsx('w-4 h-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
      viewBox='0 0 20 20'
      fill='currentColor'
      aria-hidden
    >
      <path
        fillRule='evenodd'
        d='M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z'
        clipRule='evenodd'
      />
    </svg>
  )
}

/**
 * Поисковый выпадающий список в стиле Select CRM (не нативный datalist —
 * на мобильных и в Chromium он почти не виден).
 */
export default function ComboInput({ value, onChange, options, className, placeholder, disabled }: Props) {
  const listId = useId().replace(/:/g, '')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null)

  useEffect(() => {
    if (!open) setQuery(value)
  }, [value, open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const uniq = [...new Set(options.map((o) => String(o || '').trim()).filter(Boolean))]
    if (!q) return uniq.slice(0, 200)
    return uniq.filter((o) => o.toLowerCase().includes(q)).slice(0, 200)
  }, [options, query])

  const updatePos = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 4
    const maxMenuHeight = 288
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 360) - 8)),
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      width: rect.width,
      maxHeight: Math.max(120, openUp ? Math.min(maxMenuHeight, spaceAbove) : Math.min(maxMenuHeight, spaceBelow)),
    })
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
  }, [open, updatePos, filtered.length])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
      setQuery(value)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, value])

  const pick = (next: string) => {
    onChange(next)
    setQuery(next)
    setOpen(false)
  }

  const openMenu = () => {
    if (disabled) return
    setQuery(value)
    setOpen(true)
    updatePos()
  }

  const menu =
    open && !disabled && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            className='fixed z-[9999] rounded-xl border border-border bg-surface shadow-soft overflow-hidden'
            style={{
              left: menuPos.left,
              top: menuPos.top,
              bottom: menuPos.bottom,
              width: menuPos.width,
              maxWidth: 'min(calc(100vw - 1rem), 28rem)',
            }}
            role='listbox'
          >
            <div className='px-3 py-2 text-[11px] uppercase tracking-wide text-muted border-b border-border/70 bg-bg/40 flex items-center justify-between gap-2'>
              <span>Выберите или введите</span>
              <span className='normal-case tracking-normal'>{filtered.length} из {options.length || 0}</span>
            </div>
            <ul className='overflow-auto py-1' style={{ maxHeight: menuPos.maxHeight }}>
              {filtered.map((opt) => {
                const active = opt === value
                return (
                  <li key={opt}>
                    <button
                      type='button'
                      className={clsx(
                        'w-full text-left px-4 py-2.5 text-sm transition border-b border-border/60 last:border-b-0',
                        active ? 'bg-primary/15 text-primary font-medium' : 'text-text hover:bg-bg/70'
                      )}
                      role='option'
                      aria-selected={active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(opt)}
                    >
                      {opt}
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className='px-4 py-3 text-sm text-muted'>
                  {options.length === 0 ? 'Список пуст — можно ввести вручную' : 'Нет совпадений — можно ввести вручную'}
                </li>
              )}
            </ul>
          </div>,
          document.body
        )
      : null

  return (
    <div ref={wrapRef} className='relative'>
      <div className='relative'>
        <input
          ref={inputRef}
          className={clsx('input pr-10', open && !disabled && 'border-primary', className)}
          value={open ? query : value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete='off'
          role='combobox'
          aria-expanded={open}
          aria-controls={listId}
          onFocus={openMenu}
          onClick={openMenu}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            onChange(v)
            if (!open) {
              setOpen(true)
              updatePos()
            }
          }}
        />
        <button
          type='button'
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Скрыть список' : 'Открыть список'}
          className='absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:bg-bg/70 hover:text-text transition disabled:opacity-40'
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (disabled) return
            if (open) {
              setOpen(false)
              setQuery(value)
            } else {
              openMenu()
              inputRef.current?.focus()
            }
          }}
        >
          <Chevron open={open} />
        </button>
      </div>
      {menu}
    </div>
  )
}
