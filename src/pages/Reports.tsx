import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import Select from '../components/Select'
import {
  DayLineChart,
  DONUT_COLORS,
  MetricDonutChart,
  SalesMetricBarsChart,
  formatCompactMoney,
  type DayChartType,
  type DayMetric,
} from '../components/trendCharts'
import { downloadCsv } from '../utils/exportCsv'
import { TREND_PERIOD_OPTIONS, trendPeriodLabel, type TrendPeriod } from '../utils/trendPeriods'

type DayRange = TrendPeriod

type TrendsData = {
  turnover: number
  cost: number
  profit: number
  salesCount: number
  avgCheck: number
  balance: number
  byDay: Array<{ date: string; turnover: number; profit: number; count: number }>
}

type OrdersStats = {
  totalOrders: number
  newOrders: number
  inProgress: number
  ready: number
  closed: number
  revenue: number
  cost: number
  profit: number
}

type ClientStats = {
  totalClients: number
  activeLast30Days: number
  totalRevenue: number
  avgClientValue: number
}

type PaymentStats = {
  income: number
  expense: number
  balance: number
  incomeCount: number
  expenseCount: number
}

type TaskStats = {
  totalTasks: number
  newTasks: number
  inProgress: number
  completed: number
  overdue: number
}

type WarrantyRow = {
  id: number
  client: string
  phone: string
  brand?: string
  model?: string
  warrantyEndsAt: string
  expiringSoon?: boolean
  expired?: boolean
}

function money(v: number) {
  return `${Math.round(v || 0).toLocaleString('ru-RU')} ₽`
}

export default function Reports() {
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<DayRange>('30')
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [ordersStats, setOrdersStats] = useState<OrdersStats | null>(null)
  const [clientStats, setClientStats] = useState<ClientStats | null>(null)
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null)
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null)
  const [shopStats, setShopStats] = useState<Record<string, number> | null>(null)
  const [warranties, setWarranties] = useState<WarrantyRow[]>([])
  const [warrantyStats, setWarrantyStats] = useState({ active: 0, expiringSoon: 0, expired: 0 })
  const [chartMetric, setChartMetric] = useState<DayMetric>('turnover')
  const [chartType, setChartType] = useState<DayChartType>('bars')
  const [hoveredDay, setHoveredDay] = useState<{
    key: string
    value: number
    turnover: number
    profit: number
  } | null>(null)

  useEffect(() => {
    void load()
  }, [days])

  async function load() {
    setLoading(true)
    try {
      const [trendsRes, ordersRes, clientsRes, tasksRes, paymentsRes, shopRes, warrantiesRes] = await Promise.all([
        apiFetch(`/analytics/trends?days=${days}&category=all`),
        apiFetch('/orders/stats'),
        apiFetch('/clients/stats/summary'),
        apiFetch('/tasks/stats'),
        apiFetch('/payments/stats'),
        apiFetch('/shop/stats').catch(() => null),
        apiFetch('/warranties?expiringDays=30'),
      ])

      setTrends(trendsRes.ok ? await trendsRes.json() : null)
      setOrdersStats(ordersRes.ok ? await ordersRes.json() : null)
      setClientStats(clientsRes.ok ? await clientsRes.json() : null)
      setTaskStats(tasksRes.ok ? await tasksRes.json() : null)
      setPaymentStats(paymentsRes.ok ? await paymentsRes.json() : null)
      if (shopRes?.ok) setShopStats(await shopRes.json())
      if (warrantiesRes?.ok) {
        const w = await warrantiesRes.json()
        setWarranties(w.warranties || [])
        setWarrantyStats(w.stats || { active: 0, expiringSoon: 0, expired: 0 })
      }
    } catch (e) {
      console.error('Ошибка загрузки отчётов:', e)
    } finally {
      setLoading(false)
    }
  }

  const periodLabel = useMemo(() => trendPeriodLabel(days), [days])

  const chartByDay = useMemo(() => {
    if (!trends?.byDay?.length) {
      return { values: [], max: 1, hasData: false }
    }
    const values = trends.byDay.map((d) => ({
      key: d.date,
      turnover: d.turnover,
      profit: d.profit,
      value: chartMetric === 'profit' ? d.profit : d.turnover,
      count: d.count,
    }))
    const max = Math.max(1, ...values.map((v) => Math.abs(v.value)))
    const hasData = values.some((v) => v.count > 0 || v.turnover > 0)
    return { values, max, hasData }
  }, [trends, chartMetric])

  const chartTitle = chartMetric === 'profit' ? 'Чистая прибыль по дням' : 'Выручка по дням'

  function exportReport() {
    const rows: string[][] = [
      ['Отчёт FixNet CRM', periodLabel],
      [],
      ['Финансы за период', ''],
      ['Оборот', trends?.turnover ?? 0],
      ['Расходы', trends?.cost ?? 0],
      ['Прибыль', trends?.profit ?? 0],
      ['Продаж (шт.)', trends?.salesCount ?? 0],
      ['Средний чек', trends?.avgCheck ?? 0],
      ['Баланс', trends?.balance ?? 0],
      [],
      ['Заказы (всего)', ''],
      ['Всего заказов', ordersStats?.totalOrders ?? 0],
      ['Новые', ordersStats?.newOrders ?? 0],
      ['В работе', ordersStats?.inProgress ?? 0],
      ['Готовы', ordersStats?.ready ?? 0],
      ['Закрыты', ordersStats?.closed ?? 0],
      ['Выручка по заказам', ordersStats?.revenue ?? 0],
      [],
      ['Клиенты', ''],
      ['Всего клиентов', clientStats?.totalClients ?? 0],
      ['Активны за 30 дней', clientStats?.activeLast30Days ?? 0],
      ['Средний LTV', clientStats?.avgClientValue ?? 0],
      [],
      ['Задачи', ''],
      ['Всего', taskStats?.totalTasks ?? 0],
      ['Просрочено', taskStats?.overdue ?? 0],
      ['Выполнено', taskStats?.completed ?? 0],
    ]

    if (trends?.byDay?.length) {
      rows.push([], ['По дням', 'Оборот', 'Прибыль', 'Продаж'])
      trends.byDay.forEach((d) => {
        rows.push([d.date, d.turnover, d.profit, d.count])
      })
    }

    downloadCsv(`otchet-${days}-dnei.csv`, rows)
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold'>Отчёты</h1>
          <p className='text-sm text-muted mt-1'>Сводка по финансам, заказам, клиентам и задачам</p>
        </div>
        <div className='flex flex-wrap items-end gap-2'>
          <div className='min-w-[9rem]'>
            <label className='label text-xs'>Период</label>
            <Select className='select min-h-0 py-1.5 text-sm' value={days} onChange={(e) => setDays(e.target.value as DayRange)}>
              {TREND_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <button type='button' className='btn secondary' onClick={() => void load()} disabled={loading}>
            Обновить
          </button>
          <button type='button' className='btn' onClick={exportReport} disabled={loading}>
            Экспорт CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className='card'><div className='card-inner text-center text-muted py-16'>Загрузка отчётов…</div></div>
      ) : (
        <>
          <div className='grid sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label={`Оборот (${periodLabel})`} value={money(trends?.turnover || 0)} />
            <StatCard label='Прибыль' value={money(trends?.profit || 0)} accent={trends && trends.profit >= 0 ? 'success' : 'danger'} />
            <StatCard label='Средний чек' value={money(trends?.avgCheck || 0)} />
            <StatCard label='Баланс' value={money(trends?.balance || 0)} />
          </div>

          <div className='grid lg:grid-cols-2 gap-4'>
            <div className='card'>
              <div className='card-inner'>
                <div className='font-semibold mb-4'>Заказы на ремонт</div>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <Row label='Всего' value={ordersStats?.totalOrders ?? 0} />
                  <Row label='Новые' value={ordersStats?.newOrders ?? 0} />
                  <Row label='В работе' value={ordersStats?.inProgress ?? 0} />
                  <Row label='Готовы' value={ordersStats?.ready ?? 0} />
                  <Row label='Закрыты' value={ordersStats?.closed ?? 0} />
                  <Row label='Выручка' value={money(ordersStats?.revenue || 0)} />
                  <Row label='Себестоимость' value={money(ordersStats?.cost || 0)} />
                  <Row label='Прибыль' value={money(ordersStats?.profit || 0)} />
                </dl>
              </div>
            </div>

            <div className='card'>
              <div className='card-inner'>
                <div className='font-semibold mb-4'>Клиенты и задачи</div>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <Row label='Клиентов в базе' value={clientStats?.totalClients ?? 0} />
                  <Row label='Активны (30 дн.)' value={clientStats?.activeLast30Days ?? 0} />
                  <Row label='Средний LTV' value={money(clientStats?.avgClientValue || 0)} />
                  <Row label='Выручка с клиентов' value={money(clientStats?.totalRevenue || 0)} />
                  <Row label='Задач всего' value={taskStats?.totalTasks ?? 0} />
                  <Row label='Просрочено' value={taskStats?.overdue ?? 0} />
                  <Row label='В работе' value={taskStats?.inProgress ?? 0} />
                  <Row label='Выполнено' value={taskStats?.completed ?? 0} />
                </dl>
              </div>
            </div>
          </div>

          <div className='grid lg:grid-cols-2 gap-4'>
            <div className='card'>
              <div className='card-inner'>
                <div className='font-semibold mb-4'>Платежи (всего)</div>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <Row label='Поступления' value={money(paymentStats?.income || 0)} />
                  <Row label='Расходы' value={money(paymentStats?.expense || 0)} />
                  <Row label='Операций приход' value={paymentStats?.incomeCount ?? 0} />
                  <Row label='Операций расход' value={paymentStats?.expenseCount ?? 0} />
                </dl>
              </div>
            </div>

            {shopStats && (
              <div className='card'>
                <div className='card-inner'>
                  <div className='font-semibold mb-4'>Магазин</div>
                  <dl className='grid grid-cols-2 gap-3 text-sm'>
                    {Object.entries(shopStats).slice(0, 8).map(([k, v]) => (
                      <Row key={k} label={k} value={typeof v === 'number' && k.toLowerCase().includes('revenue') ? money(v) : String(v)} />
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>

          <div className='card'>
            <div className='card-inner'>
              <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
                <div className='font-semibold'>{chartTitle}</div>
                <div className='flex flex-wrap items-end gap-3'>
                  <div className='min-w-[10rem]'>
                    <label className='label text-xs'>Показатель</label>
                    <Select className='select min-h-0 py-1.5 text-sm' value={chartMetric} onChange={(e) => setChartMetric(e.target.value as DayMetric)}>
                      <option value='turnover'>Выручка</option>
                      <option value='profit'>Чистая прибыль</option>
                    </Select>
                  </div>
                  <div className='min-w-[10rem]'>
                    <label className='label text-xs'>Вид графика</label>
                    <Select className='select min-h-0 py-1.5 text-sm' value={chartType} onChange={(e) => setChartType(e.target.value as DayChartType)}>
                      <option value='bars'>Столбцы</option>
                      <option value='line'>Линия</option>
                      <option value='area'>Область</option>
                      <option value='donut'>Диаграмма</option>
                    </Select>
                  </div>
                </div>
              </div>

              {!chartByDay.hasData ? (
                <div className='h-52 flex items-center justify-center text-muted text-sm'>За период нет данных для графика</div>
              ) : (
                <div className='relative'>
                  {hoveredDay && chartType === 'bars' && (
                    <div className='absolute top-0 right-0 z-10'>
                      <div className='bg-bg border border-border rounded-xl px-3 py-2 text-sm shadow-soft'>
                        <div className='text-muted text-xs'>Дата</div>
                        <div className='font-medium'>{hoveredDay.key}</div>
                        <div className='text-muted text-xs mt-1'>{chartMetric === 'profit' ? 'Чистая прибыль' : 'Выручка'}</div>
                        <div className={`font-semibold ${chartMetric === 'profit' ? (hoveredDay.value >= 0 ? 'text-success' : 'text-danger') : ''}`}>
                          {money(hoveredDay.value)}
                        </div>
                      </div>
                    </div>
                  )}

                  {chartType === 'bars' && (
                    <SalesMetricBarsChart
                      values={chartByDay.values}
                      max={chartByDay.max}
                      metric={chartMetric}
                      onHover={setHoveredDay}
                    />
                  )}
                  {chartType === 'line' && (
                    <DayLineChart
                      values={chartByDay.values.map((v) => ({ key: v.key, value: v.value }))}
                      max={chartByDay.max}
                      filled={false}
                      metric={chartMetric}
                    />
                  )}
                  {chartType === 'area' && (
                    <DayLineChart
                      values={chartByDay.values.map((v) => ({ key: v.key, value: v.value }))}
                      max={chartByDay.max}
                      filled
                      metric={chartMetric}
                    />
                  )}
                  {chartType === 'donut' && (
                    <MetricDonutChart
                      items={chartByDay.values
                        .filter((v) => v.value !== 0)
                        .map((v, i) => ({
                          label: v.key.slice(5).replace('-', '.'),
                          value: Math.abs(v.value),
                          color: DONUT_COLORS[i % DONUT_COLORS.length],
                        }))}
                      total={chartByDay.values.reduce((s, v) => s + v.value, 0)}
                      formatCenter={formatCompactMoney}
                      formatItem={formatCompactMoney}
                      centerHint={chartMetric === 'profit' ? 'прибыль' : 'выручка'}
                      emptyText='Нет данных для диаграммы'
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {trends?.byDay?.length ? (
            <div className='card'>
              <div className='card-inner overflow-x-auto'>
                <div className='font-semibold mb-4'>Динамика по дням ({periodLabel})</div>
                <table className='table w-full text-sm'>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th className='text-right'>Оборот</th>
                      <th className='text-right'>Прибыль</th>
                      <th className='text-right'>Продаж</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.byDay.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td className='text-right tabular-nums'>{money(d.turnover)}</td>
                        <td className={`text-right tabular-nums ${d.profit >= 0 ? 'text-success' : 'text-danger'}`}>{money(d.profit)}</td>
                        <td className='text-right tabular-nums'>{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className='card'>
            <div className='card-inner overflow-x-auto'>
              <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
                <div className='font-semibold'>Реестр гарантий</div>
                <div className='flex gap-4 text-sm text-muted'>
                  <span>Активных: <b className='text-text'>{warrantyStats.active}</b></span>
                  <span>Истекают за 30 дн.: <b className='text-warning'>{warrantyStats.expiringSoon}</b></span>
                  <span>Истекли: <b className='text-danger'>{warrantyStats.expired}</b></span>
                </div>
              </div>
              {warranties.length === 0 ? (
                <p className='text-muted text-sm'>Нет заказов с зафиксированной гарантией. Укажите «Гарантийный» при закрытии заказа.</p>
              ) : (
                <table className='table w-full text-sm'>
                  <thead>
                    <tr>
                      <th>Заказ</th>
                      <th>Клиент</th>
                      <th>Устройство</th>
                      <th>До</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warranties.slice(0, 50).map((w) => (
                      <tr key={w.id}>
                        <td>#{w.id}</td>
                        <td>{w.client}<div className='text-xs text-muted'>{w.phone}</div></td>
                        <td>{[w.brand, w.model].filter(Boolean).join(' ') || '—'}</td>
                        <td>{new Date(w.warrantyEndsAt).toLocaleDateString('ru-RU')}</td>
                        <td>
                          {w.expired ? (
                            <span className='text-danger text-xs'>Истекла</span>
                          ) : w.expiringSoon ? (
                            <span className='text-warning text-xs'>Скоро истекает</span>
                          ) : (
                            <span className='text-success text-xs'>Активна</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  return (
    <div className='card'>
      <div className='card-inner'>
        <div className='text-muted text-sm'>{label}</div>
        <div className={`text-2xl font-semibold mt-2 ${accent === 'success' ? 'text-success' : accent === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className='text-muted'>{label}</dt>
      <dd className='font-medium mt-0.5'>{value}</dd>
    </div>
  )
}
