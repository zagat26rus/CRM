import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import Select from '../components/Select'
import DailyDigestCard from '../components/DailyDigestCard'
import { CLOSED_SUCCESS_STATUSES, ORDER_STATUS_COLORS } from '../utils/orderStatuses'
import { SALE_CATEGORIES, saleCategoryLabel, type SaleCategoryId } from '../utils/saleCategories'
import { BALANCE_CHANGED_EVENT } from '../utils/balanceEvents'
import { TREND_PERIOD_OPTIONS, trendPeriodShortLabel, type TrendPeriod } from '../utils/trendPeriods'

type Order = {
  id: number
  status: string
  price?: number
  costPrice?: number
  createdAt: string
}

type OrdersStats = {
  totalOrders: number
  newOrders: number
  diagnostics?: number
  waitingParts: number
  inProgress: number
  ready: number
  closed: number
  closedFailed?: number
  refusedService?: number
  refusedClient?: number
  cancelled: number
  revenue: number
  cost: number
  profit: number
}

type DayChartType = 'bars' | 'line' | 'area' | 'donut'
type DayMetric = 'turnover' | 'profit'
type StatusChartType = 'bars' | 'pie' | 'list'
type DayRange = TrendPeriod
type CategoryFilter = 'all' | SaleCategoryId

type TrendsData = {
  turnover: number
  cost: number
  profit: number
  salesCount: number
  avgCheck: number
  balance: number
  granularity?: 'day' | 'month'
  fromDate?: string
  toDate?: string
  byDay: Array<{ date: string; turnover: number; cost: number; profit: number; count: number }>
  categoryBreakdown: Record<string, { turnover: number; cost: number; profit: number; count: number; label: string }>
  recentSales: Array<{
    id: number
    date: string
    amount: number
    cost: number
    profit: number
    saleCategory: string
    description: string
  }>
}

const CHART_HEIGHT = 200

function parseOrderDate(iso: string) {
  if (!iso) return null
  const raw = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function formatMoney(value: number) {
  const v = Number.isFinite(value) ? value : 0
  return `${Math.round(v).toLocaleString('ru-RU')} ₽`
}

function formatShortDate(key: string) {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-')
    return `${m}.${y.slice(2)}`
  }
  const [, m, d] = key.split('-')
  return `${d}.${m}`
}

function orderBucketKey(iso: string, granularity: 'day' | 'month' = 'day') {
  const day = parseOrderDate(iso)
  if (!day) return null
  return granularity === 'month' ? day.slice(0, 7) : day
}

function formatCompactMoney(value: number) {
  const v = Math.abs(Number.isFinite(value) ? value : 0)
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return `${Math.round(v)}`
}

const DONUT_COLORS = [
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

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersStats, setOrdersStats] = useState<OrdersStats | null>(null)
  const [balance, setBalance] = useState<number>(0)
  const [dayChartType, setDayChartType] = useState<DayChartType>('bars')
  const [dayMetric, setDayMetric] = useState<DayMetric>('turnover')
  const [statusChartType, setStatusChartType] = useState<StatusChartType>('bars')
  const [dayRange, setDayRange] = useState<DayRange>('7')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [hoveredSalesDay, setHoveredSalesDay] = useState<{
    key: string
    turnover: number
    profit: number
    value: number
  } | null>(null)
  const [hoveredOrdersDay, setHoveredOrdersDay] = useState<{ key: string; value: number } | null>(null)

  const periodHint = dayRange === 'all' ? 'за весь период' : `за ${trendPeriodShortLabel(dayRange)}`

  const ordersByDay = useMemo(() => {
    const granularity = trends?.granularity || 'day'

    if (trends?.byDay?.length) {
      const keys = trends.byDay.map((d) => d.date)
      const map = new Map(keys.map((k) => [k, 0]))
      for (const o of orders) {
        const k = orderBucketKey(o.createdAt, granularity)
        if (!k || !map.has(k)) continue
        map.set(k, (map.get(k) || 0) + 1)
      }
      const values = keys.map((k) => ({ key: k, value: map.get(k) || 0 }))
      const max = Math.max(1, ...values.map((v) => v.value))
      const total = values.reduce((s, v) => s + v.value, 0)
      return { values, max, total }
    }

    const daysCount = dayRange === 'all' ? 30 : Number(dayRange)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = addDays(today, -(daysCount - 1))
    const keys: string[] = []
    const map = new Map<string, number>()

    for (let i = 0; i < daysCount; i++) {
      const k = dateKey(addDays(start, i))
      keys.push(k)
      map.set(k, 0)
    }

    for (const o of orders) {
      const k = parseOrderDate(o.createdAt)
      if (!k || !map.has(k)) continue
      map.set(k, (map.get(k) || 0) + 1)
    }

    const values = keys.map((k) => ({ key: k, value: map.get(k) || 0 }))
    const max = Math.max(1, ...values.map((v) => v.value))
    const total = values.reduce((s, v) => s + v.value, 0)
    return { values, max, total }
  }, [orders, dayRange, trends])

  useEffect(() => {
    load()
    const onBalance = () => load()
    window.addEventListener(BALANCE_CHANGED_EVENT, onBalance)
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, onBalance)
  }, [dayRange, categoryFilter])

  async function load() {
    try {
      setLoading(true)

      const [ordersRes, ordersStatsRes, trendsRes] = await Promise.all([
        apiFetch('/orders?limit=1000'),
        apiFetch('/orders/stats'),
        apiFetch(`/analytics/trends?days=${dayRange}&category=${categoryFilter}`),
      ])

      const ordersJson = await ordersRes.json().catch(() => ({}))
      const statsJson = await ordersStatsRes.json().catch(() => null)
      const trendsJson = await trendsRes.json().catch(() => null)

      const list = Array.isArray(ordersJson?.orders)
        ? ordersJson.orders
        : Array.isArray(ordersJson)
          ? ordersJson
          : []

      setOrders(list)
      setOrdersStats(statsJson || null)
      setTrends(trendsJson || null)
      setBalance(typeof trendsJson?.balance === 'number' ? trendsJson.balance : 0)
    } catch (e) {
      console.error('Ошибка загрузки трендов:', e)
    } finally {
      setLoading(false)
    }
  }

  const statusItems = useMemo(() => {
    const s = ordersStats
    return [
      { label: 'Новый', value: s?.newOrders || 0, color: ORDER_STATUS_COLORS['Новый'] },
      { label: 'Диагностика', value: s?.diagnostics || 0, color: ORDER_STATUS_COLORS['Диагностика'] },
      { label: 'Ждет запчасти', value: s?.waitingParts || 0, color: ORDER_STATUS_COLORS['Ждет запчасти'] },
      { label: 'В работе', value: s?.inProgress || 0, color: ORDER_STATUS_COLORS['В работе'] },
      { label: 'Готов', value: s?.ready || 0, color: ORDER_STATUS_COLORS['Готов'] },
      { label: 'Закрыт успешно', value: s?.closed || 0, color: ORDER_STATUS_COLORS['Закрыт успешно'] },
      { label: 'Закрыт не успешно', value: s?.closedFailed || 0, color: ORDER_STATUS_COLORS['Закрыт не успешно'] },
      { label: 'Отказ сервиса', value: s?.refusedService || 0, color: ORDER_STATUS_COLORS['Отказ сервиса'] },
      { label: 'Отказ клиента', value: s?.refusedClient || 0, color: ORDER_STATUS_COLORS['Отказ клиента'] },
    ].filter((item) => item.value > 0)
  }, [ordersStats])

  const statusMax = useMemo(
    () => Math.max(1, ...statusItems.map((i) => i.value)),
    [statusItems]
  )

  const salesChartByDay = useMemo(() => {
    if (!trends?.byDay?.length) {
      return { values: [], max: 1, hasSales: false }
    }
    const values = trends.byDay.map((d) => {
      const metricValue = dayMetric === 'profit' ? d.profit : d.turnover
      return {
        key: d.date,
        turnover: d.turnover,
        profit: d.profit,
        value: metricValue,
        count: d.count,
      }
    })
    const max = Math.max(1, ...values.map((v) => Math.abs(v.value)))
    const hasSales = values.some((v) => v.count > 0 || v.turnover > 0)
    return { values, max, hasSales }
  }, [trends, dayMetric])

  const salesChartTitle = dayMetric === 'profit' ? 'Чистая прибыль по дням' : 'Выручка по дням'

  const categoryItems = useMemo(() => {
    if (!trends?.categoryBreakdown) return []
    return SALE_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      ...(trends.categoryBreakdown[c.id] || { turnover: 0, cost: 0, profit: 0, count: 0 }),
    })).filter((i) => i.count > 0 || i.turnover > 0)
  }, [trends])

  return (
    <div className='space-y-6'>
      <DailyDigestCard />
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold'>Тренды</h1>
          <p className='text-sm text-muted mt-1'>Оборот, расходы и прибыль по всем продажам</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {(['all', ...SALE_CATEGORIES.map((c) => c.id)] as CategoryFilter[]).map((id) => (
            <button
              key={id}
              type='button'
              className={`tag ${categoryFilter === id ? 'tag-active' : ''}`}
              onClick={() => setCategoryFilter(id)}
            >
              {id === 'all' ? 'Всё вместе' : SALE_CATEGORIES.find((c) => c.id === id)?.label}
            </button>
          ))}
        </div>
      </div>

      <div className='grid md:grid-cols-2 xl:grid-cols-5 gap-4'>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Оборот</div>
            <div className='text-2xl font-semibold mt-2'>{loading ? '—' : formatMoney(trends?.turnover || 0)}</div>
            <div className='text-xs text-muted mt-1'>{periodHint}</div>
          </div>
        </div>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Расходы / себестоимость</div>
            <div className='text-2xl font-semibold mt-2'>{loading ? '—' : formatMoney(trends?.cost || 0)}</div>
          </div>
        </div>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Чистая прибыль</div>
            <div className={`text-2xl font-semibold mt-2 ${(trends?.profit || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
              {loading ? '—' : formatMoney(trends?.profit || 0)}
            </div>
          </div>
        </div>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Продаж</div>
            <div className='text-2xl font-semibold mt-2'>{loading ? '—' : (trends?.salesCount || 0)}</div>
            <div className='text-xs text-muted mt-1'>средний чек {loading ? '—' : formatMoney(trends?.avgCheck || 0)}</div>
          </div>
        </div>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Баланс</div>
            <div className='text-2xl font-semibold mt-2'>{loading ? '—' : formatMoney(balance)}</div>
          </div>
        </div>
      </div>

      <div className='grid lg:grid-cols-3 gap-4'>
        <div className='card lg:col-span-2'>
          <div className='card-inner'>
            <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
              <div className='font-semibold'>{salesChartTitle}</div>
              <div className='flex flex-wrap items-end gap-3'>
                <div className='min-w-[10rem]'>
                  <label className='label text-xs'>Показатель</label>
                  <Select
                    className='select min-h-0 py-1.5 text-sm'
                    value={dayMetric}
                    onChange={(e) => setDayMetric(e.target.value as DayMetric)}
                  >
                    <option value='turnover'>Выручка</option>
                    <option value='profit'>Чистая прибыль</option>
                  </Select>
                </div>
                <div className='min-w-[9rem]'>
                  <label className='label text-xs'>Период</label>
                  <Select
                    className='select min-h-0 py-1.5 text-sm'
                    value={dayRange}
                    onChange={(e) => setDayRange(e.target.value as DayRange)}
                  >
                    {TREND_PERIOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </div>
                <div className='min-w-[10rem]'>
                  <label className='label text-xs'>Вид графика</label>
                  <Select
                    className='select min-h-0 py-1.5 text-sm'
                    value={dayChartType}
                    onChange={(e) => setDayChartType(e.target.value as DayChartType)}
                  >
                    <option value='bars'>Столбцы</option>
                    <option value='line'>Линия</option>
                    <option value='area'>Область</option>
                    <option value='donut'>Диаграмма</option>
                  </Select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className='h-64 flex items-center justify-center text-muted text-sm'>Загрузка…</div>
            ) : !salesChartByDay.hasSales ? (
              <div className='h-64 flex flex-col items-center justify-center text-muted text-sm text-center px-4'>
                <p>За период продаж нет</p>
                <p className='text-xs mt-2'>Проведите чек в «Документация» → Печать, закройте заказ или продайте со склада</p>
              </div>
            ) : (
              <div className='relative'>
                {hoveredSalesDay && (
                  <div className='absolute top-0 right-0 z-10'>
                    <div className='bg-bg border border-border rounded-xl px-3 py-2 text-sm shadow-soft'>
                      <div className='text-muted text-xs'>Дата</div>
                      <div className='font-medium'>{hoveredSalesDay.key}</div>
                      <div className='text-muted text-xs mt-1'>
                        {dayMetric === 'profit' ? 'Чистая прибыль' : 'Выручка'}
                      </div>
                      <div className={`font-semibold ${dayMetric === 'profit' ? (hoveredSalesDay.value >= 0 ? 'text-success' : 'text-danger') : ''}`}>
                        {formatMoney(hoveredSalesDay.value)}
                      </div>
                      <div className='text-muted text-xs mt-1'>
                        {dayMetric === 'profit' ? 'Выручка' : 'Прибыль'}
                      </div>
                      <div className={`font-medium ${dayMetric === 'profit' ? '' : (hoveredSalesDay.profit >= 0 ? 'text-success' : 'text-danger')}`}>
                        {formatMoney(dayMetric === 'profit' ? hoveredSalesDay.turnover : hoveredSalesDay.profit)}
                      </div>
                    </div>
                  </div>
                )}

                {dayChartType === 'bars' && (
                  <SalesMetricBarsChart
                    values={salesChartByDay.values}
                    max={salesChartByDay.max}
                    metric={dayMetric}
                    onHover={setHoveredSalesDay}
                  />
                )}
                {dayChartType === 'line' && (
                  <DayLineChart
                    values={salesChartByDay.values.map((v) => ({ key: v.key, value: v.value }))}
                    max={salesChartByDay.max}
                    filled={false}
                    metric={dayMetric}
                  />
                )}
                {dayChartType === 'area' && (
                  <DayLineChart
                    values={salesChartByDay.values.map((v) => ({ key: v.key, value: v.value }))}
                    max={salesChartByDay.max}
                    filled
                    metric={dayMetric}
                  />
                )}
                {dayChartType === 'donut' && (
                  <MetricDonutChart
                    items={salesChartByDay.values
                      .filter((v) => v.value !== 0)
                      .map((v, i) => ({
                        label: formatShortDate(v.key),
                        value: Math.abs(v.value),
                        color: DONUT_COLORS[i % DONUT_COLORS.length],
                      }))}
                    total={salesChartByDay.values.reduce((s, v) => s + v.value, 0)}
                    formatCenter={formatCompactMoney}
                    formatItem={formatCompactMoney}
                    centerHint={dayMetric === 'profit' ? 'прибыль' : 'выручка'}
                    emptyText='Нет данных для диаграммы'
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className='card'>
          <div className='card-inner'>
            <div className='font-semibold mb-4'>По категориям</div>
            {loading ? (
              <div className='text-muted text-sm'>Загрузка…</div>
            ) : categoryItems.length === 0 ? (
              <div className='text-muted text-sm'>Нет данных за период</div>
            ) : (
              <div className='space-y-4'>
                {categoryItems.map((item) => (
                  <div key={item.id}>
                    <div className='flex justify-between text-sm mb-1'>
                      <span className='text-muted'>{item.label}</span>
                      <span className='font-medium'>{item.count} прод.</span>
                    </div>
                    <div className='text-xs text-muted'>Оборот {formatMoney(item.turnover)} · Прибыль{' '}
                      <span className={item.profit >= 0 ? 'text-success' : 'text-danger'}>{formatMoney(item.profit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {trends?.recentSales && trends.recentSales.length > 0 && (
        <div className='card overflow-auto'>
          <div className='card-inner'>
            <div className='font-semibold mb-3'>Последние продажи</div>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-left text-muted border-b border-border'>
                  <th className='py-2 pr-3'>Дата</th>
                  <th className='py-2 pr-3'>Категория</th>
                  <th className='py-2 pr-3'>Описание</th>
                  <th className='py-2 pr-3 text-right'>Сумма</th>
                  <th className='py-2 pr-3 text-right'>Расходы</th>
                  <th className='py-2 text-right'>Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {trends.recentSales.map((s) => (
                  <tr key={s.id} className='border-b border-border/50'>
                    <td className='py-2 pr-3 whitespace-nowrap'>{s.date ? new Date(s.date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td className='py-2 pr-3 text-xs'>{saleCategoryLabel(s.saleCategory)}</td>
                    <td className='py-2 pr-3'>{s.description || '—'}</td>
                    <td className='py-2 pr-3 text-right tabular-nums'>{formatMoney(s.amount)}</td>
                    <td className='py-2 pr-3 text-right tabular-nums text-muted'>{formatMoney(s.cost)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${s.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatMoney(s.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className='grid md:grid-cols-3 gap-4'>
        <div className='card'>
          <div className='card-inner'>
            <div className='text-muted text-sm'>Средний чек заказов (ремонт)</div>
            <div className='text-2xl font-semibold mt-2'>
              {loading ? '—' : formatMoney(
                (() => {
                  const closed = orders.filter((o) => (CLOSED_SUCCESS_STATUSES as readonly string[]).includes(o.status))
                  const total = closed.reduce((sum, o) => sum + (Number(o.price) || 0), 0)
                  return closed.length > 0 ? total / closed.length : 0
                })()
              )}
            </div>
          </div>
        </div>
      </div>

      <div className='grid lg:grid-cols-3 gap-4'>
        <div className='card lg:col-span-2'>
          <div className='card-inner'>
            <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
              <div className='font-semibold'>Заказы по дням</div>
              <div className='flex flex-wrap items-end gap-3'>
                <div className='min-w-[9rem]'>
                  <label className='label text-xs'>Период</label>
                  <Select
                    className='select min-h-0 py-1.5 text-sm'
                    value={dayRange}
                    onChange={(e) => setDayRange(e.target.value as DayRange)}
                  >
                    {TREND_PERIOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </div>
                <div className='min-w-[10rem]'>
                  <label className='label text-xs'>Вид графика</label>
                  <Select
                    className='select min-h-0 py-1.5 text-sm'
                    value={dayChartType}
                    onChange={(e) => setDayChartType(e.target.value as DayChartType)}
                  >
                    <option value='bars'>Столбцы</option>
                    <option value='line'>Линия</option>
                    <option value='area'>Область</option>
                    <option value='donut'>Диаграмма</option>
                  </Select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className='h-64 flex items-center justify-center text-muted text-sm'>Загрузка…</div>
            ) : ordersByDay.total === 0 ? (
              <div className='h-64 flex items-center justify-center text-muted text-sm'>
                За выбранный период заказов нет
              </div>
            ) : (
              <div className='relative'>
                {hoveredOrdersDay && (
                  <div className='absolute top-0 right-0 z-10'>
                    <div className='bg-bg border border-border rounded-xl px-3 py-2 text-sm shadow-soft'>
                      <div className='text-muted text-xs'>Дата</div>
                      <div className='font-medium'>{hoveredOrdersDay.key}</div>
                      <div className='text-muted text-xs mt-1'>Заказов</div>
                      <div className='font-semibold'>{hoveredOrdersDay.value}</div>
                    </div>
                  </div>
                )}

                {dayChartType === 'bars' && (
                  <DayBarsChart
                    values={ordersByDay.values}
                    max={ordersByDay.max}
                    onHover={setHoveredOrdersDay}
                  />
                )}
                {dayChartType === 'line' && (
                  <DayLineChart values={ordersByDay.values} max={ordersByDay.max} filled={false} />
                )}
                {dayChartType === 'area' && (
                  <DayLineChart values={ordersByDay.values} max={ordersByDay.max} filled />
                )}
                {dayChartType === 'donut' && (
                  <MetricDonutChart
                    items={ordersByDay.values
                      .filter((v) => v.value > 0)
                      .map((v, i) => ({
                        label: formatShortDate(v.key),
                        value: v.value,
                        color: DONUT_COLORS[i % DONUT_COLORS.length],
                      }))}
                    total={ordersByDay.total}
                    formatCenter={(v) => String(v)}
                    formatItem={(v) => String(v)}
                    centerHint='заказов'
                    emptyText='Нет заказов для диаграммы'
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className='card'>
          <div className='card-inner'>
            <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
              <div className='font-semibold'>Заказы по статусам</div>
              <div className='min-w-[10rem]'>
                <label className='label text-xs'>Вид</label>
                <Select
                  className='select min-h-0 py-1.5 text-sm'
                  value={statusChartType}
                  onChange={(e) => setStatusChartType(e.target.value as StatusChartType)}
                >
                  <option value='bars'>Столбцы</option>
                  <option value='pie'>Круговая</option>
                  <option value='list'>Список</option>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className='text-muted text-sm'>Загрузка…</div>
            ) : statusChartType === 'list' ? (
              <div className='space-y-3'>
                {statusItems.map((item) => (
                  <StatusRow key={item.label} label={item.label} value={item.value} max={statusMax} color={item.color} />
                ))}
              </div>
            ) : statusChartType === 'pie' ? (
              <StatusPieChart items={statusItems} donut />
            ) : (
              <div className='space-y-3'>
                {statusItems.map((item) => (
                  <div key={item.label}>
                    <div className='flex justify-between text-sm mb-1'>
                      <span className='text-muted'>{item.label}</span>
                      <span className='font-medium'>{item.value}</span>
                    </div>
                    <div className='h-3 bg-surface rounded-full overflow-hidden'>
                      <div
                        className='h-full rounded-full transition-all'
                        style={{
                          width: `${(item.value / statusMax) * 100}%`,
                          backgroundColor: item.color
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SalesMetricBarsChart({
  values,
  max,
  metric,
  onHover
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

function DayBarsChart({
  values,
  max,
  onHover
}: {
  values: Array<{ key: string; value: number }>
  max: number
  onHover: (v: { key: string; value: number } | null) => void
}) {
  return (
    <div>
      <div className='flex items-end gap-1 sm:gap-2' style={{ height: CHART_HEIGHT }}>
        {values.map((v) => {
          const h = Math.round((v.value / max) * (CHART_HEIGHT - 8))
          return (
            <div
              key={v.key}
              className='flex-1 flex flex-col items-center justify-end h-full min-w-0'
              onMouseEnter={() => onHover(v)}
              onMouseLeave={() => onHover(null)}
            >
              <div className='text-[10px] sm:text-xs font-medium text-primary mb-1 tabular-nums'>
                {v.value > 0 ? v.value : ''}
              </div>
              <div
                className='w-full max-w-[3rem] mx-auto rounded-t-md bg-primary transition-all'
                style={{ height: `${Math.max(v.value > 0 ? 6 : 0, h)}px` }}
                title={`${v.key}: ${v.value}`}
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

function DayLineChart({
  values,
  max,
  filled,
  metric = 'turnover'
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

function MetricDonutChart({
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
      mid,
      lineStart,
      lineEnd,
      labelPos,
      onRight,
      labelX: onRight ? labelPos.x + 4 : labelPos.x - 4,
      textAnchor: onRight ? 'start' : 'end',
    }
  })

  const showLeaderLabels = segments.length <= 6 && segments.every((s) => s.sweep >= 6)
  const centerValue = formatCenter(total)

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
        <text
          x={cx}
          y={centerHint ? cy - 2 : cy + 6}
          textAnchor='middle'
          className='fill-current text-2xl font-bold'
        >
          {centerValue}
        </text>
        {centerHint && (
          <text x={cx} y={cy + 18} textAnchor='middle' fill='currentColor' className='text-muted text-[10px]'>
            {centerHint}
          </text>
        )}
        {showLeaderLabels &&
          segments.map((s) => (
            <g key={`label-${s.label}`}>
              <line
                x1={s.lineStart.x}
                y1={s.lineStart.y}
                x2={s.lineEnd.x}
                y2={s.lineEnd.y}
                stroke={s.color}
                strokeWidth='1.5'
              />
              <text
                x={s.labelX}
                y={s.labelPos.y + 4}
                textAnchor={s.textAnchor as 'start' | 'end'}
                fill={s.color}
                className='text-xs font-semibold'
              >
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

function StatusPieChart({
  items,
  donut = false
}: {
  items: Array<{ label: string; value: number; color: string }>
  donut?: boolean
}) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) {
    return <div className='text-muted text-sm py-8 text-center'>Нет заказов по статусам</div>
  }

  let acc = 0
  const segments = items
    .filter((i) => i.value > 0)
    .map((item) => {
      const start = (acc / total) * 100
      acc += item.value
      const end = (acc / total) * 100
      return { ...item, start, end }
    })

  const gradient = segments
    .map((s) => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`)
    .join(', ')

  return (
    <div className='flex flex-col sm:flex-row items-center gap-6'>
      <div className='relative shrink-0'>
        <div
          className='w-36 h-36 sm:w-40 sm:h-40 rounded-full'
          style={{ background: `conic-gradient(${gradient})` }}
        />
        {donut && (
          <div className='absolute inset-[22%] rounded-full bg-bg flex items-center justify-center'>
            <div className='text-center'>
              <div className='text-xl font-bold'>{total}</div>
              <div className='text-[10px] text-muted'>всего</div>
            </div>
          </div>
        )}
      </div>
      <div className='space-y-2 flex-1 w-full'>
        {segments.map((s) => (
          <div key={s.label} className='flex items-center justify-between gap-2 text-sm'>
            <div className='flex items-center gap-2 min-w-0'>
              <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ backgroundColor: s.color }} />
              <span className='text-muted truncate'>{s.label}</span>
            </div>
            <span className='font-medium tabular-nums'>
              {s.value} ({Math.round((s.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusRow({
  label,
  value,
  max,
  color
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  return (
    <div>
      <div className='flex justify-between text-sm mb-1'>
        <span className='text-muted'>{label}</span>
        <span className='font-medium'>{value}</span>
      </div>
      <div className='h-2 bg-surface rounded-full overflow-hidden'>
        <div
          className='h-full rounded-full transition-all'
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
