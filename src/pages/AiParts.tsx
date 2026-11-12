import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../utils'
import { apiFetch } from '../api'
import { useAuth } from '../auth'

type Offer = {
  supplier: string
  city?: string
  title: string
  price: number | null
  currency?: string
  inStock?: boolean | null
  url?: string
  sku?: string | null
}

type SupplierStatus = {
  supplier: string
  ok: boolean
  error: string | null
  hint: string | null
  offerCount: number
}

type PriceInsight = {
  retailMin: number | null
  bestBuyPrice: number
  bestBuySupplier: string
  bestInStockPrice: number | null
  bestInStockSupplier: string | null
  margin: number | null
  marginPct: number | null
  verdict: 'ok' | 'thin' | 'healthy' | 'below_cost' | 'no_retail'
  hint: string
}

type SearchResult = {
  query: string
  parsed: { brand?: string; model?: string; partLabel?: string; searchQuery?: string; via?: string }
  suppliers: SupplierStatus[]
  offers: Offer[]
  retail: { issueName: string; partType: string; priceMin: number } | null
  priceInsight: PriceInsight | null
  summary: string
  cached: boolean
  fetchedAt: string
}

type AiSettings = {
  enabledSuppliers: string[]
  cacheTtlMinutes: number
  cityFocus: string
  llm: { provider: string; baseUrl: string; model: string; apiKeySet: boolean }
  greensparkCookieSet: boolean
  libertiCookieSet: boolean
  siriustCookieSet: boolean
}

const SUPPLIERS: { id: string; label: string }[] = [
  { id: 'divizion', label: 'Divizion (Ставрополь)' },
  { id: 'stavdisplay', label: 'StavDisplay (Ставрополь)' },
  { id: 'greenspark', label: 'GreenSpark (Ставрополь)' },
  { id: 'liberti', label: 'Liberti' },
  { id: 'siriust', label: 'Siriust' },
  { id: 'taggsm', label: 'TAGGSM' }
]

const EXAMPLES = ['аккумулятор iPhone X', 'дисплей Samsung A52', 'шлейф зарядки Xiaomi Redmi Note 10', 'стекло iPhone 11']

const VERDICT_STYLE: Record<PriceInsight['verdict'], { label: string; color: string }> = {
  healthy: { label: 'Хорошая маржа', color: '#22c55e' },
  ok: { label: 'Нормальная маржа', color: '#eab308' },
  thin: { label: 'Узкая маржа', color: '#f97316' },
  below_cost: { label: 'Ниже закупа', color: '#ef4444' },
  no_retail: { label: 'Нет цены клиенту', color: '#94a3b8' }
}

const rub = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(Number(n)).toLocaleString('ru-RU')} ₽`

async function readError(res: Response, fallback: string) {
  try {
    const data = await res.json()
    return data.error || fallback
  } catch {
    return fallback
  }
}

export default function AiParts() {
  const toast = useToast()
  const auth = useAuth()
  const canConfigure = auth.user?.role === 'owner' || auth.user?.role === 'admin'

  const [query, setQuery] = useState('')
  const [skipCache, setSkipCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [onlyInStock, setOnlyInStock] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function search(q = query, fresh = skipCache) {
    const text = q.trim()
    if (text.length < 2) return toast.push('Введите запрос, например: аккумулятор iPhone X')
    setLoading(true)
    try {
      const res = await apiFetch('/ai/parts-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, skipCache: fresh })
      })
      if (!res.ok) throw new Error(await readError(res, 'Ошибка поиска'))
      setResult(await res.json())
    } catch (e: any) {
      toast.push(e.message || 'Ошибка поиска')
    } finally {
      setLoading(false)
    }
  }

  async function copySummary() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.summary)
      toast.push('Сводка скопирована')
    } catch {
      toast.push('Не удалось скопировать')
    }
  }

  const offers = (result?.offers || []).filter((o) => !onlyInStock || o.inStock === true)
  const insight = result?.priceInsight || null
  const verdict = insight ? VERDICT_STYLE[insight.verdict] : null

  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-xl font-semibold'>Запчасти ИИ</h1>
          <div className='text-sm text-muted'>
            Поиск запчастей у поставщиков: сравнение закупочных цен, наличие и маржа к вашему прайсу.
          </div>
        </div>
        {canConfigure && (
          <button className='btn secondary' onClick={() => setSettingsOpen(true)}>
            Настройки поиска
          </button>
        )}
      </div>

      <div className='card'>
        <div className='card-inner space-y-3'>
          <form
            className='flex gap-2 flex-wrap'
            onSubmit={(e) => {
              e.preventDefault()
              search()
            }}
          >
            <input
              className='input flex-1 min-w-[220px]'
              placeholder='Например: аккумулятор iPhone X'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className='btn' type='submit' disabled={loading}>
              {loading ? 'Ищем…' : 'Найти'}
            </button>
          </form>
          <div className='flex gap-2 flex-wrap items-center'>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type='button'
                className='btn secondary text-xs'
                onClick={() => {
                  setQuery(ex)
                  search(ex)
                }}
              >
                {ex}
              </button>
            ))}
          </div>
          <label className='flex items-center gap-2 text-sm cursor-pointer'>
            <input type='checkbox' checked={skipCache} onChange={(e) => setSkipCache(e.target.checked)} />
            <span>Обновить данные (не брать из кэша)</span>
          </label>
        </div>
      </div>

      {loading && <div className='py-10 text-center text-muted'>Опрашиваем поставщиков, это занимает до 20 секунд…</div>}

      {result && !loading && (
        <div className='space-y-4'>
          <div className='card'>
            <div className='card-inner space-y-2'>
              <div className='flex items-center gap-2 flex-wrap text-sm'>
                <span className='text-muted'>Распознано:</span>
                {[result.parsed.partLabel, result.parsed.brand, result.parsed.model].filter(Boolean).length ? (
                  [result.parsed.partLabel, result.parsed.brand, result.parsed.model]
                    .filter(Boolean)
                    .map((x) => (
                      <span key={String(x)} className='px-2 py-0.5 rounded-full border border-border'>
                        {x}
                      </span>
                    ))
                ) : (
                  <span>—</span>
                )}
                {result.cached && <span className='text-xs text-muted'>из кэша</span>}
              </div>
              {insight && verdict && (
                <div className='rounded-lg border p-3 space-y-1' style={{ borderColor: verdict.color }}>
                  <div className='font-semibold' style={{ color: verdict.color }}>
                    {verdict.label}
                  </div>
                  <div className='text-sm'>{insight.hint}</div>
                  <div className='text-xs text-muted'>
                    Лучшая цена: {rub(insight.bestBuyPrice)} ({insight.bestBuySupplier})
                    {insight.bestInStockPrice != null && (
                      <>
                        {' · '}в наличии от {rub(insight.bestInStockPrice)} ({insight.bestInStockSupplier})
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className='flex gap-2 flex-wrap'>
                {result.suppliers.map((s) => (
                  <span
                    key={s.supplier}
                    className='px-2 py-1 rounded-lg border border-border text-xs'
                    title={s.hint || s.error || ''}
                    style={{ opacity: s.ok ? 1 : 0.6 }}
                  >
                    {s.supplier}: {s.ok ? `${s.offerCount} шт.` : 'нет данных'}
                  </span>
                ))}
              </div>
              {result.suppliers.some((s) => !s.ok && s.hint) && (
                <div className='text-xs text-muted space-y-0.5'>
                  {result.suppliers
                    .filter((s) => !s.ok && s.hint)
                    .map((s) => (
                      <div key={s.supplier}>
                        {s.supplier}: {s.hint}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className='card'>
            <div className='card-inner space-y-3'>
              <div className='flex items-center justify-between gap-3 flex-wrap'>
                <div className='font-semibold'>Предложения ({offers.length})</div>
                <div className='flex gap-3 items-center'>
                  <label className='flex items-center gap-2 text-sm cursor-pointer'>
                    <input type='checkbox' checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} />
                    <span>Только в наличии</span>
                  </label>
                  <button className='btn secondary text-sm' onClick={copySummary}>
                    Копировать сводку
                  </button>
                </div>
              </div>
              {offers.length === 0 ? (
                <div className='py-6 text-center text-muted'>Ничего не найдено. Уточните запрос или проверьте настройки поставщиков.</div>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='table'>
                    <thead>
                      <tr>
                        <th className='text-left'>Поставщик</th>
                        <th className='text-left'>Товар</th>
                        <th className='text-right'>Цена</th>
                        <th className='text-left'>Наличие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o, i) => (
                        <tr key={`${o.supplier}-${o.sku || i}-${i}`}>
                          <td>
                            <div>{o.supplier}</div>
                            {o.city && <div className='text-xs text-muted'>{o.city}</div>}
                          </td>
                          <td>
                            {o.url ? (
                              <a href={o.url} target='_blank' rel='noreferrer' className='underline'>
                                {o.title}
                              </a>
                            ) : (
                              o.title
                            )}
                          </td>
                          <td className='text-right whitespace-nowrap font-semibold'>{rub(o.price)}</td>
                          <td className='whitespace-nowrap'>
                            {o.inStock === true ? 'В наличии' : o.inStock === false ? 'Под заказ' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className='text-xs text-muted'>Данные на {new Date(result.fetchedAt).toLocaleString('ru-RU')}</div>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <AiSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState<AiSettings | null>(null)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [ttl, setTtl] = useState(30)
  const [provider, setProvider] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [greensparkCookie, setGreensparkCookie] = useState('')
  const [libertiCookie, setLibertiCookie] = useState('')
  const [siriustCookie, setSiriustCookie] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiFetch('/ai/parts-search/settings')
        if (!res.ok) throw new Error(await readError(res, 'Не удалось загрузить настройки'))
        const s: AiSettings = await res.json()
        setLoaded(s)
        setSuppliers(s.enabledSuppliers)
        setTtl(s.cacheTtlMinutes)
        setProvider(s.llm.provider)
        setBaseUrl(s.llm.baseUrl)
        setModel(s.llm.model)
      } catch (e: any) {
        toast.push(e.message || 'Ошибка загрузки')
        onClose()
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        enabledSuppliers: suppliers,
        cacheTtlMinutes: ttl,
        llm: { provider, baseUrl, model, apiKey, clearApiKey }
      }
      if (greensparkCookie.trim()) body.greensparkCookie = greensparkCookie
      if (libertiCookie.trim()) body.libertiCookie = libertiCookie
      if (siriustCookie.trim()) body.siriustCookie = siriustCookie
      const res = await apiFetch('/ai/parts-search/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await readError(res, 'Не удалось сохранить'))
      toast.push('Настройки сохранены')
      onClose()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: string) =>
    setSuppliers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const cookieField = (label: string, isSet: boolean | undefined, value: string, onChange: (v: string) => void) => (
    <div className='space-y-1'>
      <label className='label'>
        {label} {isSet ? '(сохранён)' : '(не задан)'}
      </label>
      <input
        className='input'
        value={value}
        placeholder={isSet ? 'Оставьте пустым, чтобы не менять' : 'Вставьте Cookie после входа на сайт'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  return (
    <Modal title='Настройки поиска запчастей' onClose={onClose}>
      {loading || !loaded ? (
        <div className='py-10 text-center text-muted'>Загрузка…</div>
      ) : (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <div className='label'>Поставщики ({loaded.cityFocus})</div>
            {SUPPLIERS.map((s) => (
              <label key={s.id} className='flex items-center gap-2 text-sm min-h-[32px] cursor-pointer'>
                <input type='checkbox' checked={suppliers.includes(s.id)} onChange={() => toggle(s.id)} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>

          <div className='space-y-1'>
            <label className='label'>Хранить результаты в кэше, минут (5–240)</label>
            <input
              className='input'
              type='number'
              min={5}
              max={240}
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
            />
          </div>

          <div className='space-y-2'>
            <div className='label'>Разбор запроса нейросетью (необязательно)</div>
            <input className='input' value={provider} placeholder='Провайдер' onChange={(e) => setProvider(e.target.value)} />
            <input className='input' value={baseUrl} placeholder='Адрес API' onChange={(e) => setBaseUrl(e.target.value)} />
            <input className='input' value={model} placeholder='Модель' onChange={(e) => setModel(e.target.value)} />
            <input
              className='input'
              type='password'
              value={apiKey}
              placeholder={loaded.llm.apiKeySet ? 'Ключ сохранён, оставьте пустым, чтобы не менять' : 'API-ключ'}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {loaded.llm.apiKeySet && (
              <label className='flex items-center gap-2 text-sm cursor-pointer'>
                <input type='checkbox' checked={clearApiKey} onChange={(e) => setClearApiKey(e.target.checked)} />
                <span>Удалить сохранённый ключ</span>
              </label>
            )}
          </div>

          <div className='space-y-2'>
            <div className='label'>Cookie для сайтов с авторизацией</div>
            {cookieField('GreenSpark', loaded.greensparkCookieSet, greensparkCookie, setGreensparkCookie)}
            {cookieField('Liberti', loaded.libertiCookieSet, libertiCookie, setLibertiCookie)}
            {cookieField('Siriust', loaded.siriustCookieSet, siriustCookie, setSiriustCookie)}
          </div>

          <div className='flex gap-2'>
            <button className='btn' disabled={saving} onClick={save}>
              Сохранить
            </button>
            <button className='btn secondary' onClick={onClose}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
