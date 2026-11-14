import { API_URL } from './config'

const LS_KEY = 'authToken'

export function apiUrl(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_URL}${p}`
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const url = input.startsWith('http://') || input.startsWith('https://') ? input : apiUrl(input)
  const token = localStorage.getItem(LS_KEY)

  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(url, { ...init, headers })
}

/** URL статических файлов backend (/uploads/...) */
export function staticUrl(path: string) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const origin = API_URL.replace(/\/api$/i, '')
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export function isImageAttachment(att: { mime?: string; name?: string; url?: string }) {
  if (att.mime?.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|avif)$/i.test(att.name || att.url || '')
}
