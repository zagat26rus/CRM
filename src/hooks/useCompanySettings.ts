import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { ORDER_STATUSES as FALLBACK_STATUSES } from '../utils/orderStatuses'

type CompanySettings = {
  orderStatuses: string[]
  notificationTemplates: Record<string, string>
  warrantyDaysDefault: number
}

let cache: CompanySettings | null = null
let cachePromise: Promise<CompanySettings> | null = null

export async function fetchCompanySettings(): Promise<CompanySettings> {
  if (cache) return cache
  if (cachePromise) return cachePromise
  cachePromise = apiFetch('/company/settings')
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      cache = {
        orderStatuses: Array.isArray(data.orderStatuses) && data.orderStatuses.length ? data.orderStatuses : [...FALLBACK_STATUSES],
        notificationTemplates: data.notificationTemplates || {},
        warrantyDaysDefault: Number(data.warrantyDaysDefault) || 90,
      }
      return cache
    })
    .catch(() => {
      cache = {
        orderStatuses: [...FALLBACK_STATUSES],
        notificationTemplates: {},
        warrantyDaysDefault: 90,
      }
      return cache
    })
    .finally(() => {
      cachePromise = null
    })
  return cachePromise
}

export function invalidateCompanySettingsCache() {
  cache = null
}

export function useOrderStatuses() {
  const [statuses, setStatuses] = useState<string[]>([...FALLBACK_STATUSES])
  const [settings, setSettings] = useState<CompanySettings | null>(null)

  useEffect(() => {
    fetchCompanySettings().then((s) => {
      setSettings(s)
      setStatuses(s.orderStatuses)
    })
  }, [])

  return { statuses, settings, reload: () => fetchCompanySettings().then((s) => { setSettings(s); setStatuses(s.orderStatuses) }) }
}
