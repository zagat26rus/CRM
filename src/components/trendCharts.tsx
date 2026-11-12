export type DayChartType = 'bars' | 'line' | 'area' | 'donut'
export type DayMetric = 'turnover' | 'profit'

export const CHART_HEIGHT = 200

export const DONUT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#6366f1',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
]

export function formatShortDate(key: string) {
  const [, m, d] = key.split('-')
  return `${d}.${m}`
}

export function formatCompactMoney(value: number) {
  const v = Math.abs(Number.isFinite(value) ? value : 0)
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return `${Math.round(v)}`
}

export function SalesMetricBarsChart({
  values,
  max,
  metric,
  onHover,
}: {
  values: Array<{ key: string; value: number; turnover: number; profit: number }>
  max: number
  metric: DayMetric
  onHover: (v: { key: string; value: number; turnover: number; profit: number } | null) => void
}) {
  return (
    <div>
      <div className='flex items-end gap-1 sm:gap-2' style={{ height: CHART_HEIGHT }}>
        {values.map((v) => {
          const h = Math.round((Math.abs(v.value) / max) * (CHART_HEIGHT - 8))
          const barClass =
            metric === 'profit'
              ? v.value > 0
                ? 'bg-success'
                : v.value < 0
                  ? 'bg-danger'
                  : 'bg-muted'
              : 'bg-primary'
          const labelClass =
            metric === 'profit'
              ? v.value > 0
                ? 'text-success'
                : v.value < 0
                  ? 'text-danger'
                  : 'text-muted'
              : 'text-primary'
          return (
            <div
              key={v.key}
              className='flex-1 flex flex-col items-center justify-end h-full min-w-0'
              onMouseEnter={() => onHover(v)}
              onMouseLeave={() => onHover(null)}
            >
              <div className={`text-[10px] sm:text-xs font-medium mb-1 tabular-nums ${labelClass}`}>
                {v.value !== 0 ? `${Math.round(v.value).toLocaleString('ru-RU')}` : ''}
              </div>
              <div
                className={`w-full max-w-[3rem] mx-auto rounded-t-md transition-all ${barClass}`}
                style={{ height: `${Math.max(v.value !== 0 ? 6 : 0, h)}px` }}
                title={`${v.key}: ${v.value} ₽`}
              />
            </div>
          )
        })}
      </div>
      <div className='flex gap-1 sm:gap-2 mt-2 border-t border-border pt-2'>
        {values.map((v) => (
          <div key={v.key} className='flex-1 text-center text-[10px] sm:text-xs text-muted truncate min-w-0'>
            {formatShortDate(v.key)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DayLineChart({
  values,
  max,
  filled,
  metric = 'turnover',
}: {
  values: Array<{ key: string; value: number }>
  max: number
  filled: boolean
  metric?: DayMetric
}) {
  const strokeClass = metric === 'profit' ? 'stroke-success' : 'stroke-primary'
  const fillClass = metric === 'profit' ? 'fill-success/25' : 'fill-primary/25'
  const dotClass = metric === 'profit' ? 'fill-success' : 'fill-primary'
  const width = 640
  const height = CHART_HEIGHT
  const padX = 12
  const padY = 12
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const points = values.map((v, i) => {
    const x = padX + (values.length <= 1 ? innerW / 2 : (i / (values.length - 1)) * innerW)
    const y = padY + innerH - (Math.abs(v.value) / max) * innerH
    return { x, y, ...v }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padX} ${height - padY} L ${points[0]?.x ?? padX} ${height - padY} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className='w-full h-auto' style={{ maxHeight: CHART_HEIGHT }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * (1 - t)}
            y2={padY + innerH * (1 - t)}
            stroke='currentColor'
            className='text-border'
            strokeWidth='1'
          />
        ))}
        {filled && <path d={areaPath} className={fillClass} />}
        <path d={linePath} fill='none' className={strokeClass} strokeWidth='2.5' strokeLinejoin='round' />
        {points.map((p) => (
          <g key={p.key}>
            <circle cx={p.x} cy={p.y} r='5' className={dotClass} />
            <title>{`${p.key}: ${p.value}`}</title>
          </g>
        ))}
      </svg>
      <div className='flex justify-between gap-1 mt-2 text-[10px] sm:text-xs text-muted'>
        {values.map((v) => (
          <span key={v.key} className='flex-1 text-center truncate'>
            {formatShortDate(v.key)}
          </span>
        ))}
      </div>
    </div>
  )
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSegmentPath(cx: number, cy: number, ir: number, or: number, start: number, end: number) {
  const sweep = Math.min(end - start, 359.99)
  const endAngle = start + sweep
  const os = polar(cx, cy, or, start)
  const oe = polar(cx, cy, or, endAngle)
  const ie = polar(cx, cy, ir, endAngle)
  const is_ = polar(cx, cy, ir, start)
  const large = sweep > 180 ? 1 : 0
  return `M ${os.x} ${os.y} A ${or} ${or} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${ir} ${ir} 0 ${large} 0 ${is_.x} ${is_.y} Z`
}

export function MetricDonutChart({
  items,
  total,
  formatCenter,
  formatItem,
  centerHint,
  emptyText,
}: {
  items: Array<{ label: string; value: number; color: string }>
  total: number
  formatCenter: (value: number) => string
  formatItem: (value: number) => string
  centerHint?: string
  emptyText: string
}) {
  const filtered = items.filter((i) => i.value > 0)
  const sliceTotal = filtered.reduce((s, i) => s + i.value, 0)

  if (filtered.length === 0 || sliceTotal === 0) {
    return <div className='text-muted text-sm py-8 text-center'>{emptyText}</div>
  }

  const cx = 150
  const cy = 140
  const ir = 54
  const or = 88
  let angle = 0

  const segments = filtered.map((item) => {
    const sweep = (item.value / sliceTotal) * 360
    const start = angle
    const end = angle + sweep
    angle = end
    const mid = start + sweep / 2
    const lineStart = polar(cx, cy, or + 2, mid)
    const lineEnd = polar(cx, cy, or + 22, mid)
    const labelPos = polar(cx, cy, or + 30, mid)
    const onRight = labelPos.x >= cx
    return {
      ...item,
      start,
      end,
      sweep,
      lineStart,
      lineEnd,
      labelPos,
      onRight,
      labelX: onRight ? labelPos.x + 4 : labelPos.x - 4,
      textAnchor: onRight ? 'start' : 'end',
    }
  })

  const showLeaderLabels = segments.length <= 6 && segments.every((s) => s.sweep >= 6)

  return (
    <div className='flex flex-col lg:flex-row items-center gap-6 py-2'>
      <svg viewBox='0 0 300 280' className='w-full max-w-[300px] shrink-0' aria-hidden>
        {segments.map((s) => (
          <path
            key={s.label}
            d={donutSegmentPath(cx, cy, ir, or, s.start, s.end)}
            fill={s.color}
            stroke='#0e0f10'
            strokeWidth='2'
          />
        ))}
        <circle cx={cx} cy={cy} r={ir - 1} className='fill-bg' />
        <text x={cx} y={centerHint ? cy - 2 : cy + 6} textAnchor='middle' className='fill-current text-2xl font-bold'>
          {formatCenter(total)}
        </text>
        {centerHint && (
          <text x={cx} y={cy + 18} textAnchor='middle' fill='currentColor' className='text-muted text-[10px]'>
            {centerHint}
          </text>
        )}
        {showLeaderLabels &&
          segments.map((s) => (
            <g key={`label-${s.label}`}>
              <line x1={s.lineStart.x} y1={s.lineStart.y} x2={s.lineEnd.x} y2={s.lineEnd.y} stroke={s.color} strokeWidth='1.5' />
              <text x={s.labelX} y={s.labelPos.y + 4} textAnchor={s.textAnchor as 'start' | 'end'} fill={s.color} className='text-xs font-semibold'>
                {formatItem(s.value)}
              </text>
            </g>
          ))}
      </svg>
      <div className='space-y-2 flex-1 w-full min-w-0'>
        {segments.map((s) => (
          <div key={s.label} className='flex items-center justify-between gap-2 text-sm'>
            <div className='flex items-center gap-2 min-w-0'>
              <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ backgroundColor: s.color }} />
              <span className='text-muted truncate'>{s.label}</span>
            </div>
            <span className='font-medium tabular-nums shrink-0'>
              {formatItem(s.value)} ({Math.round((s.value / sliceTotal) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
