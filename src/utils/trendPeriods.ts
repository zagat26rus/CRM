export type TrendPeriod = '7' | '14' | '30' | '90' | '180' | '365' | 'all'

export const TREND_PERIOD_OPTIONS: Array<{ value: TrendPeriod; label: string }> = [
  { value: '7', label: '7 дней' },
  { value: '14', label: '14 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '180', label: 'Полгода' },
  { value: '365', label: 'Год' },
  { value: 'all', label: 'За весь период' },
]

export function trendPeriodLabel(value: TrendPeriod): string {
  return TREND_PERIOD_OPTIONS.find((o) => o.value === value)?.label || `${value} дн.`
}

export function trendPeriodShortLabel(value: TrendPeriod): string {
  if (value === 'all') return 'весь период'
  return trendPeriodLabel(value).toLowerCase()
}
