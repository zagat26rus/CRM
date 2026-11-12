import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'fixnet-theme'
export const THEME_META = {
  dark: '#0e0f10',
  light: '#f3f4f6',
} as const

type Listener = (theme: Theme) => void
const listeners = new Set<Listener>()

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function getDocumentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return readStoredTheme()
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_META[theme])

  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (apple) {
    apple.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent')
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }

  listeners.forEach((l) => l(theme))
}

export function subscribeTheme(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function toggleTheme(current?: Theme): Theme {
  const next: Theme = (current ?? getDocumentTheme()) === 'light' ? 'dark' : 'light'
  applyTheme(next)
  return next
}

/** Apply saved theme before/without React (also mirrored in index.html inline). */
export function initTheme() {
  applyTheme(readStoredTheme())
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getDocumentTheme())

  useEffect(() => subscribeTheme(setThemeState), [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return
      if (e.newValue === 'light' || e.newValue === 'dark') applyTheme(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return {
    theme,
    isLight: theme === 'light',
    setTheme: (t: Theme) => applyTheme(t),
    toggle: () => toggleTheme(theme),
  }
}
