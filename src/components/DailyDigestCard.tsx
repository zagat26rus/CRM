import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'

type Digest = {
  enabled: boolean
  config: { lowStockThreshold: number }
  repairs: { totalOpen: number; ready: number; newToday: number; issuedToday: number; overdue: number }
  stock: {
    totalSkus: number
    totalQty: number
    zeroStock: number
    lowStock: { id: number; name: string; sku?: string; quantity: number }[]
  }
  purchase: {
    waitingParts: number
    hint: string
    waitingList: { id: number; documentNumber?: string; client?: string; device?: string; status?: string }[]
  }
}

export default function DailyDigestCard() {
  const [digest, setDigest] = useState<Digest | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    apiFetch('/digest/daily')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDigest(d))
      .catch(() => setDigest(null))
  }, [])

  if (!digest || !digest.enabled) return null
  const { repairs, stock, purchase } = digest
  const items = [
    { label: 'В работе', value: repairs.totalOpen },
    { label: 'Готово к выдаче', value: repairs.ready },
    { label: 'Новых сегодня', value: repairs.newToday },
    { label: 'Выдано сегодня', value: repairs.issuedToday },
    { label: 'Старше 7 дней', value: repairs.overdue },
    { label: 'Ждут запчасти', value: purchase.waitingParts }
  ]

  return (
    <div className='card'>
      <div className='card-inner space-y-3'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <div className='font-semibold'>Сводка дня</div>
          <div className='flex gap-2'>
            <Link to='/ai-parts' className='btn secondary text-sm'>
              Запчасти ИИ
            </Link>
            <button className='btn secondary text-sm' onClick={() => setOpen((v) => !v)}>
              {open ? 'Свернуть' : 'Подробнее'}
            </button>
          </div>
        </div>
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2'>
          {items.map((i) => (
            <div key={i.label} className='rounded-lg border border-border p-2'>
              <div className='text-xs text-muted'>{i.label}</div>
              <div className='text-lg font-semibold'>{i.value}</div>
            </div>
          ))}
        </div>
        <div className='text-sm text-muted'>
          Склад: {stock.totalSkus} позиций, {stock.totalQty} шт., нулевых: {stock.zeroStock}. {purchase.hint}
        </div>
        {open && (
          <div className='grid md:grid-cols-2 gap-4'>
            <div className='space-y-1'>
              <div className='text-sm font-semibold'>Заканчивается на складе (≤ {digest.config.lowStockThreshold})</div>
              {stock.lowStock.length === 0 ? (
                <div className='text-sm text-muted'>Нет позиций</div>
              ) : (
                stock.lowStock.map((p) => (
                  <div key={p.id} className='flex justify-between gap-3 text-sm'>
                    <span className='truncate'>{p.name}</span>
                    <span className='whitespace-nowrap'>{p.quantity} шт.</span>
                  </div>
                ))
              )}
            </div>
            <div className='space-y-1'>
              <div className='text-sm font-semibold'>Ремонты ждут запчасти</div>
              {purchase.waitingList.length === 0 ? (
                <div className='text-sm text-muted'>Нет</div>
              ) : (
                purchase.waitingList.map((o) => (
                  <div key={o.id} className='flex justify-between gap-3 text-sm'>
                    <span className='truncate'>
                      #{o.documentNumber || o.id} {o.client || ''} {o.device ? `· ${o.device}` : ''}
                    </span>
                    <span className='whitespace-nowrap text-muted'>{o.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
