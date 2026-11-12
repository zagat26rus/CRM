/** База API: в собранном приложении — относительный /api; в dev — localhost:5000 */
const raw = import.meta.env.VITE_API_URL as string | undefined
const fallback = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api'

export const API_URL = (raw?.trim() || fallback).replace(/\/+$/, '')

/** Публичный адрес из QR/SMS — сертификат production выпущен на www.fedfix.ru. */
const publicSiteRaw = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
export const PUBLIC_SITE_URL = (publicSiteRaw?.trim() || 'https://www.fedfix.ru').replace(/\/+$/, '')
