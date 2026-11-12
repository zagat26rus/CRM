import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import type { InventoryPickItem, OrderPartLine } from '../utils/notifyClient'

type Props = {
  parts: OrderPartLine[]
  partsWrittenOff?: boolean
  onChange: (parts: OrderPartLine[]) => void
}

export default function OrderPartsSection({ parts, partsWrittenOff, onChange }: Props) {
  const [items, setItems] = useState<InventoryPickItem[]>([])
  const [pickId, setPickId] = useState('')
  const [qty, setQty] = useState('1')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiFetch('/inventory/items?limit=500')
        const data = await res.json()
        if (!cancelled) setItems(Array.isArray(data) ? data : data.items || [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totalCost = useMemo(
    () => parts.reduce((s, p) => s + (Number(p.purchasePrice) || 0) * (Number(p.quantity) || 0), 0),
    [parts]
  )

  function addPart() {
    const item = items.find((i) => String(i.id) === pickId)
    if (!item) return
    const quantity = Math.max(1, Number(qty) || 1)
    if (quantity > item.quantity) {
      alert(`На складе только ${item.quantity} шт.`)
      return
    }
    const existing = parts.find((p) => p.itemId === item.id)
    if (existing) {
      onChange(parts.map((p) => (p.itemId === item.id ? { ...p, quantity: p.quantity + quantity } : p)))
    } else {
      onChange([
        ...parts,
        {
          itemId: item.id,
          itemName: item.name,
          sku: item.sku || '',
          quantity,
          purchasePrice: Number(item.purchasePrice) || 0,
          salePrice: Number(item.salePrice) || 0,
        },
      ])
    }
    setPickId('')
    setQty('1')
  }

  function removePart(itemId: number) {
    onChange(parts.filter((p) => p.itemId !== itemId))
  }

  return (
    <div className='md:col-span-2 border border-border rounded-xl p-4 space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='font-semibold text-sm'>Запчасти со склада</div>
        <div className='text-xs text-muted'>Себестоимость: {totalCost.toLocaleString('ru-RU')} ₽</div>
      </div>

      {partsWrittenOff && (
        <div className='text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2'>
          Запчасти списаны со склада — состав зафиксирован
        </div>
      )}

      {parts.length > 0 && (
        <div className='space-y-2'>
          {parts.map((p) => (
            <div key={p.itemId} className='flex items-center justify-between gap-2 text-sm bg-surface/40 rounded-lg px-3 py-2'>
              <div className='min-w-0'>
                <div className='font-medium truncate'>{p.itemName}</div>
                <div className='text-xs text-muted'>
                  {p.quantity} × {p.purchasePrice.toLocaleString('ru-RU')} ₽
                  {p.sku ? ` · ${p.sku}` : ''}
                </div>
              </div>
              {!partsWrittenOff && (
                <button type='button' className='btn ghost text-xs px-2 py-1 text-danger shrink-0' onClick={() => removePart(p.itemId)}>
                  Убрать
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!partsWrittenOff && (
        <div className='grid grid-cols-1 sm:grid-cols-[1fr_5rem_auto] gap-2 items-end'>
          <div>
            <label className='label text-xs'>Товар</label>
            <select className='select' value={pickId} onChange={(e) => setPickId(e.target.value)} disabled={loading}>
              <option value=''>Выберите…</option>
              {items.filter((i) => i.quantity > 0).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (ост. {i.quantity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className='label text-xs'>Кол-во</label>
            <input className='input' type='number' min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <button type='button' className='btn secondary' onClick={addPart} disabled={!pickId}>
            Добавить
          </button>
        </div>
      )}
    </div>
  )
}
