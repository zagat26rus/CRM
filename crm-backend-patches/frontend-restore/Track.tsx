import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl, isImageAttachment, staticUrl } from '../api'

type TrackData = {
  order: {
    documentNumber: string
    status: string
    client?: string
    phoneMasked?: string
    brand?: string
    model?: string
    deviceType?: string
    problem?: string
    description?: string
    dueAt?: string | null
    createdAt?: string
    updatedAt?: string
    estimatedPrice?: number | null
    problems?: { name?: string; description?: string }[]
  }
  service: { name: string; address: string; phone: string; email: string; workHours: string }
  attachments: { name: string; url: string; mime?: string; createdAt?: string; message?: string }[]
  timeline: { type: string; message: string; createdAt: string }[]
}

const fmt = (v?: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Track() {
  const { token = '' } = useParams()
  const [data, setData] = useState<TrackData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Статус ремонта — FixNet'
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/public/track/${encodeURIComponent(token)}`))
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Заявка не найдена')
        if (!cancelled) setData(json)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить статус')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const o = data?.order
  const device = [o?.brand, o?.model].filter(Boolean).join(' ') || o?.deviceType || ''
  const works = (o?.problems || []).map((p) => p.name || p.description).filter(Boolean)
  const photos = (data?.attachments || []).filter((a) => isImageAttachment(a))

  return (
    <div className='min-h-screen bg-bg text-text'>
      <div className='max-w-xl mx-auto p-4 space-y-4'>
        <div className='text-center pt-4'>
          <div className='text-2xl font-bold'>
            Фикс<span style={{ color: '#f5c400' }}>Нэт</span>
          </div>
          <div className='text-sm text-muted'>Статус вашего ремонта</div>
        </div>

        {loading && <div className='py-10 text-center text-muted'>Загрузка…</div>}
        {!loading && error && (
          <div className='card'>
            <div className='card-inner text-center space-y-1'>
              <div className='font-semibold'>{error}</div>
              <div className='text-sm text-muted'>Проверьте ссылку или QR-код на квитанции.</div>
            </div>
          </div>
        )}

        {data && o && (
          <>
            <div className='card'>
              <div className='card-inner space-y-3'>
                <div className='flex items-center justify-between gap-3 flex-wrap'>
                  <div className='text-sm text-muted'>Заявка № {o.documentNumber}</div>
                  <div className='px-3 py-1 rounded-full text-sm font-semibold' style={{ background: '#f5c400', color: '#111' }}>
                    {o.status}
                  </div>
                </div>
                {device && <div className='text-lg font-semibold'>{device}</div>}
                <div className='grid grid-cols-2 gap-2 text-sm'>
                  {o.client && (
                    <div>
                      <div className='text-muted text-xs'>Клиент</div>
                      <div>{o.client}</div>
                    </div>
                  )}
                  {o.phoneMasked && (
                    <div>
                      <div className='text-muted text-xs'>Телефон</div>
                      <div>{o.phoneMasked}</div>
                    </div>
                  )}
                  {o.createdAt && (
                    <div>
                      <div className='text-muted text-xs'>Принято</div>
                      <div>{fmt(o.createdAt)}</div>
                    </div>
                  )}
                  {o.dueAt && (
                    <div>
                      <div className='text-muted text-xs'>Срок готовности</div>
                      <div>{fmt(o.dueAt)}</div>
                    </div>
                  )}
                  {o.estimatedPrice ? (
                    <div>
                      <div className='text-muted text-xs'>Ориентировочная стоимость</div>
                      <div>{Math.round(Number(o.estimatedPrice)).toLocaleString('ru-RU')} ₽</div>
                    </div>
                  ) : null}
                </div>
                {(works.length > 0 || o.problem) && (
                  <div className='text-sm'>
                    <div className='text-muted text-xs'>Неисправность и работы</div>
                    <div>{works.length ? works.join('; ') : o.problem}</div>
                  </div>
                )}
              </div>
            </div>

            {data.timeline.length > 0 && (
              <div className='card'>
                <div className='card-inner space-y-3'>
                  <div className='font-semibold'>История</div>
                  {data.timeline.map((t, i) => (
                    <div key={i} className='text-sm'>
                      <div className='text-xs text-muted'>{fmt(t.createdAt)}</div>
                      <div>{t.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {photos.length > 0 && (
              <div className='card'>
                <div className='card-inner space-y-3'>
                  <div className='font-semibold'>Фото</div>
                  <div className='grid grid-cols-3 gap-2'>
                    {photos.map((a, i) => (
                      <a key={i} href={staticUrl(a.url)} target='_blank' rel='noreferrer'>
                        <img src={staticUrl(a.url)} alt={a.name} className='w-full h-24 object-cover rounded-lg border border-border' />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className='card'>
              <div className='card-inner space-y-1 text-sm'>
                <div className='font-semibold'>{data.service.name}</div>
                <div className='text-muted'>{data.service.address}</div>
                <div>
                  <a href={`tel:${data.service.phone.replace(/[^\d+]/g, '')}`} className='underline'>
                    {data.service.phone}
                  </a>
                </div>
                <div className='text-muted'>{data.service.workHours}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
