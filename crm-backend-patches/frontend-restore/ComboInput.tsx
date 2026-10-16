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
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 4
    const maxMenuHeight = 288
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    setMenuPos({
      left: rect.left,
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
              maxWidth: 'min(calc(100vw - 2rem), 28rem)',
            }}
            role='listbox'
          >
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
      <input
        ref={inputRef}
        className={clsx('input', className)}
        value={open ? query : value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete='off'
        role='combobox'
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => {
          if (disabled) return
          setQuery(value)
          setOpen(true)
          updatePos()
        }}
        onClick={() => {
          if (disabled) return
          setOpen(true)
          updatePos()
        }}
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
      {menu}
    </div>
  )
}
