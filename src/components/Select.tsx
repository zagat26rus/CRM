import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

export type SelectOption = { value: string; label: string; disabled?: boolean }

function parseOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as {
      value?: string | number
      disabled?: boolean
      children?: React.ReactNode
    }
    options.push({
      value: props.value === undefined || props.value === null ? '' : String(props.value),
      label: String(props.children ?? ''),
      disabled: props.disabled,
    })
  })
  return options
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options?: SelectOption[]
  buttonClassName?: string
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

function splitSelectClasses(className?: string) {
  const visual = new Set(['select', 'input', 'textarea'])
  const wrap: string[] = []
  const btn: string[] = []

  for (const token of (className || '').split(/\s+/).filter(Boolean)) {
    if (visual.has(token)) btn.push(token)
    else wrap.push(token)
  }

  if (!btn.includes('select') && !btn.includes('input')) btn.push('select')

  return { wrap: wrap.join(' '), btn: btn.join(' ') }
}

type MenuPosition = {
  left: number
  top?: number
  bottom?: number
  minWidth: number
  maxHeight: number
}

export default function Select({
  value = '',
  onChange,
  children,
  className,
  buttonClassName,
  disabled,
  title,
  options: optionsProp,
  ...rest
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const strValue = String(value ?? '')

  const options = useMemo(
    () => optionsProp ?? parseOptions(children),
    [optionsProp, children]
  )

  const selected = options.find((o) => o.value === strValue)
  const label = selected?.label ?? options.find((o) => o.value === '')?.label ?? 'Выберите...'

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return

    const rect = btn.getBoundingClientRect()
    const gap = 4
    const maxMenuHeight = 288
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow

    setMenuPos({
      left: rect.left,
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      minWidth: rect.width,
      maxHeight: Math.max(120, openUp ? Math.min(maxMenuHeight, spaceAbove) : Math.min(maxMenuHeight, spaceBelow))
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updateMenuPosition()
    const onLayout = () => updateMenuPosition()
    window.addEventListener('scroll', onLayout, true)
    window.addEventListener('resize', onLayout)
    return () => {
      window.removeEventListener('scroll', onLayout, true)
      window.removeEventListener('resize', onLayout)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
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

  const pick = (next: string) => {
    onChange?.({
      target: { value: next },
    } as React.ChangeEvent<HTMLSelectElement>)
    setOpen(false)
  }

  const { wrap: layoutClassName, btn: fieldClassName } = splitSelectClasses(className)

  const menu = open && !disabled && menuPos
    ? createPortal(
        <div
          ref={menuRef}
          className='fixed z-[9999] rounded-xl border border-border bg-surface shadow-soft overflow-hidden'
          style={{
            left: menuPos.left,
            top: menuPos.top,
            bottom: menuPos.bottom,
            minWidth: menuPos.minWidth,
            width: 'max-content',
            maxWidth: 'min(calc(100vw - 2rem), 28rem)'
          }}
          role='listbox'
        >
          <ul className='overflow-auto py-1' style={{ maxHeight: menuPos.maxHeight }}>
            {options.map((opt) => {
              const active = opt.value === strValue
              return (
                <li key={`${opt.value}::${opt.label}`}>
                  <button
                    type='button'
                    disabled={opt.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !opt.disabled && pick(opt.value)}
                    className={clsx(
                      'w-full text-left px-4 py-2.5 text-sm transition border-b border-border/60 last:border-b-0',
                      active
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-text hover:bg-bg/70',
                      opt.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    role='option'
                    aria-selected={active}
                  >
                    {opt.label}
                  </button>
                </li>
              )
            })}
            {options.length === 0 && (
              <li className='px-4 py-3 text-sm text-muted'>Нет вариантов</li>
            )}
          </ul>
        </div>,
        document.body
      )
    : null

  return (
    <div
      ref={ref}
      className={clsx('relative', layoutClassName)}
      title={title}
      {...(rest.id ? { id: rest.id } : {})}
    >
      <button
        ref={buttonRef}
        type='button'
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!open) updateMenuPosition()
          setOpen((v) => !v)
        }}
        className={clsx(
          fieldClassName,
          'w-full text-left flex items-center justify-between gap-2',
          disabled && 'opacity-50 cursor-not-allowed',
          open && !disabled && 'border-primary',
          buttonClassName
        )}
        aria-haspopup='listbox'
        aria-expanded={open}
      >
        <span className='truncate'>{label}</span>
        <Chevron open={open} />
      </button>

      {menu}
    </div>
  )
}
