import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

export type CashRegister = {
  id: number
  name: string
  type: string
  isDefault: boolean
  isActive: boolean
  balance?: number
}

export function useCashRegisters() {
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (all = false) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/cash-registers${all ? '?all=1' : ''}`)
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки касс')
      setRegisters(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки касс')
      setRegisters([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const defaultId = registers.find((r) => r.isDefault)?.id || registers[0]?.id || ''

  return { registers, loading, error, reload, defaultId }
}
