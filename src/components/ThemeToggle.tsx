import { useTheme } from '../theme'

type Props = {
  /** compact = icon-only (topbar); row = sidebar label button */
  variant?: 'compact' | 'row'
  className?: string
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' aria-hidden>
      <circle cx='12' cy='12' r='4' strokeWidth='1.8' />
      <path
        strokeWidth='1.8'
        strokeLinecap='round'
        d='M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M18.4 5.6l-1.1 1.1M6.7 17.3l-1.1 1.1'
      />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' aria-hidden>
      <path
        strokeWidth='1.8'
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5 7.5 7.5 0 1 0 20.5 14.2z'
      />
    </svg>
  )
}

export default function ThemeToggle({ variant = 'row', className = '' }: Props) {
  const { theme, toggle } = useTheme()
  const isLight = theme === 'light'
  const label = isLight ? 'Светлая тема' : 'Тёмная тема'
  const nextLabel = isLight ? 'Включить тёмную тему' : 'Включить светлую тему'

  if (variant === 'compact') {
    return (
      <button
        type='button'
        onClick={toggle}
        className={`btn icon ghost shrink-0 ${className}`.trim()}
        title={nextLabel}
        aria-label={nextLabel}
      >
        {isLight ? <MoonIcon className='w-5 h-5' /> : <SunIcon className='w-5 h-5' />}
      </button>
    )
  }

  return (
    <button
      type='button'
      onClick={toggle}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-muted hover:bg-surface hover:text-text transition touch-manipulation ${className}`.trim()}
      aria-label={nextLabel}
      title={nextLabel}
    >
      {isLight ? <SunIcon className='w-4 h-4 shrink-0 text-primary' /> : <MoonIcon className='w-4 h-4 shrink-0 text-primary' />}
      <span className='truncate'>{label}</span>
      <span className='ml-auto text-[11px] opacity-70'>{isLight ? 'светлая' : 'тёмная'} · сменить</span>
    </button>
  )
}
