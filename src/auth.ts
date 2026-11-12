import { create } from 'zustand'
import { API_URL } from './config'

export type AuthUser = {
  id: number
  companyId: number
  name: string
  email: string
  role: 'owner' | 'admin' | 'director' | 'master'
}

export type Company = {
  id: number
  name: string
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  company: Company | null
  bootstrapped: boolean
  setToken: (token: string | null) => void
  bootstrap: () => Promise<void>
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  registerOwner: (payload: {
    email: string
    password: string
    name: string
    company: { name: string; inn?: string; city?: string; address?: string }
  }) => Promise<void>
  acceptInvite: (token: string, payload: { name: string; email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const LS_KEY = 'authToken'
const LS_REMEMBER = 'authRemember'
const LS_EMAIL = 'authEmail'
const LS_PASS = 'authPass'

function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function encodePass(password: string) {
  try {
    return btoa(unescape(encodeURIComponent(password)))
  } catch {
    return btoa(password)
  }
}

function decodePass(value: string) {
  try {
    return decodeURIComponent(escape(atob(value)))
  } catch {
    try {
      return atob(value)
    } catch {
      return ''
    }
  }
}

export function getRememberedCredentials(): { email: string; password: string } | null {
  if (localStorage.getItem(LS_REMEMBER) !== '1') return null
  const email = localStorage.getItem(LS_EMAIL) || ''
  const password = decodePass(localStorage.getItem(LS_PASS) || '')
  if (!email || !password) return null
  return { email, password }
}

function saveRemembered(email: string, password: string) {
  localStorage.setItem(LS_REMEMBER, '1')
  localStorage.setItem(LS_EMAIL, email)
  localStorage.setItem(LS_PASS, encodePass(password))
}

function clearRemembered() {
  localStorage.removeItem(LS_REMEMBER)
  localStorage.removeItem(LS_EMAIL)
  localStorage.removeItem(LS_PASS)
}

async function fetchMe(token: string, attempts = 5): Promise<{ user: AuthUser; company: Company | null }> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { headers: { ...authHeaders(token) } })
      if (res.status === 401 || res.status === 403) {
        const err = new Error('unauthorized')
        ;(err as any).status = res.status
        throw err
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      return { user: data.user || null, company: data.company || null }
    } catch (e: any) {
      lastError = e
      if (e?.status === 401 || e?.status === 403) throw e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastError
}

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  company: null,
  bootstrapped: false,

  setToken: (token) => {
    if (token) localStorage.setItem(LS_KEY, token)
    else localStorage.removeItem(LS_KEY)
    set({ token })
  },

  bootstrap: async () => {
    const token = localStorage.getItem(LS_KEY)

    // Есть сохранённый токен — пробуем восстановить сессию
    if (token) {
      set({ token })
      try {
        const data = await fetchMe(token)
        set({ user: data.user, company: data.company, bootstrapped: true })
        return
      } catch (e: any) {
        // Только при 401 сбрасываем токен; сетевые сбои — оставляем и пробуем auto-login
        if (e?.status === 401 || e?.status === 403) {
          localStorage.removeItem(LS_KEY)
          set({ token: null })
        }
      }
    }

    // Авто-вход по сохранённым логину/паролю (для .exe)
    const remembered = getRememberedCredentials()
    if (remembered) {
      try {
        await get().login(remembered.email, remembered.password, true)
        set({ bootstrapped: true })
        return
      } catch {
        // неверный пароль — покажем форму входа
      }
    }

    set({
      token: get().token && localStorage.getItem(LS_KEY) ? get().token : null,
      user: null,
      company: null,
      bootstrapped: true,
    })
  },

  login: async (email, password, remember = true) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Ошибка входа')
    get().setToken(data.token)
    if (remember) saveRemembered(email.trim(), password)
    else clearRemembered()
    set({ user: data.user, company: data.company })
  },

  registerOwner: async (payload) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Ошибка регистрации')
    get().setToken(data.token)
    saveRemembered(payload.email.trim(), payload.password)
    set({ user: data.user, company: data.company })
  },

  acceptInvite: async (token, payload) => {
    const res = await fetch(`${API_URL}/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Ошибка регистрации по приглашению')
    get().setToken(data.token)
    saveRemembered(payload.email.trim(), payload.password)
    set({ user: data.user, company: data.company })
  },

  logout: async () => {
    const token = get().token
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { ...authHeaders(token) } })
      }
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(LS_KEY)
      clearRemembered()
      set({ token: null, user: null, company: null })
    }
  },
}))
