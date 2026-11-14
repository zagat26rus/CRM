import { useEffect, useRef, useState } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'

type Props = {
  clientName: string
  onCancel: () => void
  onConfirm: (signatureData: string) => void
}

export default function ClientSignaturePad({ clientName, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)
  useLockBodyScroll(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.6
      ctx.strokeStyle = '#111827'
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = point(event)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const prev = lastPointRef.current
    const next = point(event)
    const ctx = canvas?.getContext('2d')
    if (!ctx || !prev) return
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPointRef.current = next
    setHasInk(true)
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    event.preventDefault()
    drawingRef.current = false
    lastPointRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {}
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const confirm = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    onConfirm(canvas.toDataURL('image/png'))
  }

  return (
    <div className='modal-overlay z-[80]'>
      <div className='modal-panel max-w-3xl w-full'>
        <div className='card-inner space-y-4'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h2 className='modal-title'>Подпись клиента</h2>
              <p className='text-sm text-muted mt-1'>{clientName || 'Клиент'}</p>
            </div>
            <button type='button' className='btn secondary shrink-0' onClick={onCancel}>
              Закрыть
            </button>
          </div>

          <div className='rounded-xl border border-border bg-surface p-3 text-xs sm:text-sm text-muted space-y-2 max-h-36 overflow-y-auto'>
            <p>
              Подписывая документ, клиент подтверждает правильность данных об устройстве и его состоянии,
              согласие с условиями приёма, ремонта, гарантии и обработки персональных данных.
            </p>
            <p>
              Ориентировочные стоимость и срок могут измениться после диагностики и согласования. Сервис не
              отвечает за данные на устройстве; резервная копия выполняется клиентом.
            </p>
          </div>

          <div>
            <div className='flex items-center justify-between gap-2 mb-2'>
              <label className='label mb-0'>Распишитесь пальцем в поле</label>
              <button type='button' className='btn ghost text-sm' onClick={clear}>
                Очистить
              </button>
            </div>
            <canvas
              ref={canvasRef}
              className='block w-full h-56 sm:h-64 rounded-xl border-2 border-dashed border-border bg-white touch-none'
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
              aria-label='Поле подписи клиента'
            />
            <p className='text-xs text-muted mt-2'>Подпись сохранится в документе приёмки вместе с датой.</p>
          </div>

          <div className='flex gap-3'>
            <button type='button' className='btn secondary flex-1' onClick={onCancel}>
              Назад
            </button>
            <button type='button' className='btn flex-1' disabled={!hasInk} onClick={confirm}>
              Подписать и создать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
