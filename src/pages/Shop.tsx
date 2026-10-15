import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'
import { apiFetch } from '../api'
import { notifyBalanceChanged } from '../utils/balanceEvents'
import { SALE_CATEGORIES, type SaleCategoryId } from '../utils/saleCategories'

type InvCategory = {
  id: number
  name: string
  isActive?: boolean
}

type StockItem = {
  id: number
  name: string
  sku?: string
  quantity: number
  unit?: string
  purchasePrice: number
  salePrice: number
  categoryId?: number | null
  categoryName?: string | null
  warehouseName?: string | null
  description?: string
}

type SaleLine = {
  itemId: number
  name: string
  sku?: string
  quantity: number
  price: number
  purchasePrice: number
  maxQty: number
}

type ShopSale = {
  id: number
  orderNumber: string
  clientName: string
  clientPhone: string
  clientEmail?: string
  clientAddress?: string
  status: string
  paymentStatus: string
  paymentMethod?: string
  subtotal: number
  deliveryCost: number
  total: number
  notes?: string
  estimatedCost?: number
  items: Array<{
    productId?: number
    inventoryItemId?: number
    name: string
    quantity: number
    price: number
    purchasePrice?: number
    sku?: string
  }>
  createdAt?: string
}

type ShopStats = {
  totalOrders: number
  totalRevenue: number
  totalProducts: number
  activeProducts: number
  ordersByStatus: Record<string, number>
  popularProducts: Array<{ id: number; name: string; price: number }>
}

const PAYMENT_METHODS = [
  { id: 'cash', name: 'Наличные' },
  { id: 'card', name: 'Карта' },
  { id: 'online', name: 'Онлайн' },
  { id: 'bank', name: 'Банковский перевод' },
]

export default function Shop() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'catalog' | 'sales' | 'stats'>('catalog')

  const [items, setItems] = useState<StockItem[]>([])
  const [categories, setCategories] = useState<InvCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showZero, setShowZero] = useState(false)

  const [sales, setSales] = useState<ShopSale[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [saleSearch, setSaleSearch] = useState('')

  const [stats, setStats] = useState<ShopStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const [openSale, setOpenSale] = useState(false)
  const [selectedSale, setSelectedSale] = useState<ShopSale | null>(null)

  // Sale form
  const [lines, setLines] = useState<SaleLine[]>([])
  const [pickItemId, setPickItemId] = useState('')
  const [pickQty, setPickQty] = useState('1')
  const [pickPrice, setPickPrice] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleCategory, setSaleCategory] = useState<SaleCategoryId>('tech')
  const [printAfter, setPrintAfter] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadCatalog()
      loadCategories()
    } else if (activeTab === 'sales') {
      loadSales()
    } else if (activeTab === 'stats') {
      loadStats()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'catalog') return
    const t = setTimeout(() => loadCatalog(), 250)
    return () => clearTimeout(t)
  }, [search, categoryFilter, showZero, activeTab])

  useEffect(() => {
    if (activeTab !== 'sales') return
    const t = setTimeout(() => loadSales(), 250)
    return () => clearTimeout(t)
  }, [saleSearch, activeTab])

  async function loadCatalog() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (categoryFilter) params.set('categoryId', categoryFilter)
      params.set('inStock', showZero ? '0' : '1')
      const resp = await apiFetch(`/shop/catalog?${params.toString()}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Ошибка загрузки')
      setItems(Array.isArray(data) ? data : [])
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось загрузить склад')
    } finally {
      setLoading(false)
    }
  }

  async function loadCategories() {
    try {
      const resp = await apiFetch('/shop/inventory-categories')
      const data = await resp.json()
      setCategories(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    }
  }

  async function loadSales() {
    try {
      setSalesLoading(true)
      const resp = await apiFetch('/shop/sales')
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Ошибка')
      let rows: ShopSale[] = Array.isArray(data) ? data : []
      const q = saleSearch.trim().toLowerCase()
      if (q) {
        rows = rows.filter(
          (o) =>
            o.orderNumber?.toLowerCase().includes(q) ||
            o.clientName?.toLowerCase().includes(q) ||
            o.clientPhone?.includes(q) ||
            o.items?.some((i) => i.name?.toLowerCase().includes(q))
        )
      }
      setSales(rows)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось загрузить продажи')
    } finally {
      setSalesLoading(false)
    }
  }

  async function loadStats() {
    try {
      setStatsLoading(true)
      const resp = await apiFetch('/shop/stats')
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Ошибка')
      setStats(data)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось загрузить статистику')
    } finally {
      setStatsLoading(false)
    }
  }

  function resetSaleForm() {
    setLines([])
    setPickItemId('')
    setPickQty('1')
    setPickPrice('')
    setClientName('')
    setClientPhone('')
    setClientEmail('')
    setNotes('')
    setPaymentMethod('cash')
    setSaleCategory('tech')
    setPrintAfter(true)
  }

  function openSaleModal(prefillItem?: StockItem) {
    resetSaleForm()
    if (prefillItem) {
      setLines([
        {
          itemId: prefillItem.id,
          name: prefillItem.name,
          sku: prefillItem.sku,
          quantity: 1,
          price: Number(prefillItem.salePrice || 0),
          purchasePrice: Number(prefillItem.purchasePrice || 0),
          maxQty: Number(prefillItem.quantity || 0),
        },
      ])
    }
    setOpenSale(true)
  }

  const pickItem = useMemo(
    () => items.find((i) => String(i.id) === pickItemId) || null,
    [items, pickItemId]
  )

  useEffect(() => {
    if (!pickItem) {
      setPickPrice('')
      return
    }
    setPickPrice(String(pickItem.salePrice || 0))
    setPickQty('1')
  }, [pickItemId])

  function addLine() {
    if (!pickItem) return toast.push('Выберите товар со склада')
    const qty = Number(pickQty || 0)
    if (!Number.isFinite(qty) || qty <= 0) return toast.push('Количество должно быть > 0')
    if (qty > pickItem.quantity) return toast.push(`На складе только ${pickItem.quantity}`)
    const price = pickPrice.trim() === '' ? Number(pickItem.salePrice || 0) : Number(pickPrice)
    if (!Number.isFinite(price) || price < 0) return toast.push('Цена некорректна')

    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === pickItem.id)
      if (existing) {
        const nextQty = existing.quantity + qty
        if (nextQty > pickItem.quantity) {
          toast.push(`На складе только ${pickItem.quantity}`)
          return prev
        }
        return prev.map((l) =>
          l.itemId === pickItem.id ? { ...l, quantity: nextQty, price } : l
        )
      }
      return [
        ...prev,
        {
          itemId: pickItem.id,
          name: pickItem.name,
          sku: pickItem.sku,
          quantity: qty,
          price,
          purchasePrice: Number(pickItem.purchasePrice || 0),
          maxQty: Number(pickItem.quantity || 0),
        },
      ]
    })
    setPickItemId('')
    setPickQty('1')
    setPickPrice('')
  }

  function updateLineQty(itemId: number, qtyStr: string) {
    const qty = Number(qtyStr || 0)
    setLines((prev) =>
      prev.map((l) => {
        if (l.itemId !== itemId) return l
        if (!Number.isFinite(qty) || qty <= 0) return l
        return { ...l, quantity: Math.min(qty, l.maxQty) }
      })
    )
  }

  function updateLinePrice(itemId: number, priceStr: string) {
    const price = Number(priceStr || 0)
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId && Number.isFinite(price) && price >= 0 ? { ...l, price } : l
      )
    )
  }

  const saleSubtotal = useMemo(
    () => lines.reduce((s, l) => s + l.price * l.quantity, 0),
    [lines]
  )
  const saleCost = useMemo(
    () => lines.reduce((s, l) => s + l.purchasePrice * l.quantity, 0),
    [lines]
  )
  const saleProfit = saleSubtotal - saleCost

  async function submitSale() {
    if (lines.length === 0) return toast.push('Добавьте товары со склада')
    setSaving(true)
    try {
      const resp = await apiFetch('/shop/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim() || 'Розничный покупатель',
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim(),
          notes: notes.trim(),
          paymentMethod,
          saleCategory,
          items: lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            price: l.price,
          })),
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || `Ошибка ${resp.status}`)

      toast.push('Продажа проведена: склад списан, платежи созданы')
      notifyBalanceChanged()
      setOpenSale(false)
      resetSaleForm()
      await loadCatalog()
      if (activeTab === 'sales') await loadSales()

      if (printAfter && data?.invoice) {
        printInvoice(data.invoice)
      } else if (printAfter && data?.order?.id) {
        await printInvoiceForOrder(data.order.id)
      }
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось провести продажу')
    } finally {
      setSaving(false)
    }
  }

  async function printInvoiceForOrder(orderId: number) {
    try {
      const resp = await apiFetch(`/shop/orders/${orderId}/invoice`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Ошибка накладной')
      printInvoice(data)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось открыть накладную')
    }
  }

  function printInvoice(data: any) {
    const html = generateInvoiceHtml(data)
    const w = window.open('', '_blank')
    if (!w) {
      toast.push('Разрешите всплывающие окна для печати')
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 250)
  }

  function generateInvoiceHtml(data: any) {
    const { order, company, invoiceDate } = data
    const date = new Date(invoiceDate || order.createdAt || Date.now()).toLocaleDateString('ru-RU')
    const items = order.items || []

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Накладная ${order.orderNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; max-width: 860px; margin: 0 auto; color: #111; }
    .header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    h2 { margin: 0 0 8px; font-size: 18px; color: #444; }
    .box { padding: 14px; background: #f7f7f7; border-radius: 8px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 14px; }
    th { background: #f0f0f0; }
    .total { text-align: right; margin-top: 18px; font-size: 18px; font-weight: 700; }
    .sign { display: flex; justify-content: space-between; margin-top: 48px; gap: 40px; }
    .sign div { flex: 1; border-top: 1px solid #999; padding-top: 8px; font-size: 13px; color: #555; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${company?.name || 'Компания'}</h1>
      ${company?.address ? `<div>${company.address}</div>` : ''}
      ${company?.phone ? `<div>Тел: ${company.phone}</div>` : ''}
      ${company?.inn ? `<div>ИНН: ${company.inn}</div>` : ''}
    </div>
    <div style="text-align:right">
      <h2>Накладная на продажу</h2>
      <div><strong>№ ${order.orderNumber}</strong></div>
      <div>Дата: ${date}</div>
      <div>Оплата: ${PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.name || order.paymentMethod || '—'}</div>
    </div>
  </div>

  <div class="box">
    <strong>Покупатель:</strong> ${order.clientName || 'Розничный покупатель'}
    ${order.clientPhone ? `<br/>Телефон: ${order.clientPhone}` : ''}
    ${order.clientEmail ? `<br/>Email: ${order.clientEmail}` : ''}
    ${order.clientAddress ? `<br/>Адрес: ${order.clientAddress}` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Товар</th>
        <th>Кол-во</th>
        <th>Цена</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item: any, idx: number) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.name}${item.sku ? ` <span style="color:#888">(${item.sku})</span>` : ''}</td>
          <td>${item.quantity}</td>
          <td>${Number(item.price || 0).toLocaleString('ru-RU')} ₽</td>
          <td>${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString('ru-RU')} ₽</td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="total">Итого: ${Number(order.total || 0).toLocaleString('ru-RU')} ₽</div>
  ${order.notes ? `<div class="box"><strong>Примечание:</strong><br/>${order.notes}</div>` : ''}

  <div class="sign">
    <div>Отпустил ________________</div>
    <div>Получил ________________</div>
  </div>
</body>
</html>`
  }

  const catalogAvailable = useMemo(
    () => items.filter((i) => Number(i.quantity) > 0),
    [items]
  )

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-2xl font-bold'>Магазин</h1>
          <p className='text-sm text-muted mt-1'>Продажа со склада · списание · платежи · накладная</p>
        </div>
        <button className='btn' onClick={() => openSaleModal()}>
          + Продажа
        </button>
      </div>

      <div className='flex gap-2 border-b border-border'>
        {(
          [
            ['catalog', 'Каталог склада'],
            ['sales', 'Продажи'],
            ['stats', 'Статистика'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 font-medium transition ${
              activeTab === id ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'catalog' && (
        <div className='space-y-4'>
          <div className='flex flex-col sm:flex-row gap-2'>
            <input
              className='input flex-1'
              placeholder='Поиск по складу...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select className='input' value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value=''>Все категории склада</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label className='flex items-center gap-2 text-sm px-2 whitespace-nowrap'>
              <input type='checkbox' checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
              Показывать нулевые
            </label>
          </div>

          {loading ? (
            <div className='text-muted p-6'>Загрузка...</div>
          ) : items.length === 0 ? (
            <div className='card p-8 text-center text-muted'>
              На складе нет позиций{showZero ? '' : ' с остатком'}. Добавьте товар в разделе «Склад».
            </div>
          ) : (
            <div className='card overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left text-muted border-b border-border'>
                    <th className='p-3'>Товар</th>
                    <th className='p-3'>Категория</th>
                    <th className='p-3'>Остаток</th>
                    <th className='p-3'>Закуп, ₽</th>
                    <th className='p-3'>Продажа, ₽</th>
                    <th className='p-3'></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className='border-t border-border hover:bg-surface/50'>
                      <td className='p-3'>
                        <div className='font-medium'>{item.name}</div>
                        {item.sku ? <div className='text-xs text-muted'>{item.sku}</div> : null}
                      </td>
                      <td className='p-3 text-muted'>{item.categoryName || '—'}</td>
                      <td className='p-3'>
                        <span className={item.quantity > 0 ? 'text-green-500' : 'text-red-500'}>
                          {item.quantity} {item.unit || 'шт'}
                        </span>
                      </td>
                      <td className='p-3 text-muted'>{Number(item.purchasePrice || 0).toLocaleString('ru-RU')}</td>
                      <td className='p-3 font-medium'>{Number(item.salePrice || 0).toLocaleString('ru-RU')}</td>
                      <td className='p-3 text-right'>
                        <button
                          className='btn secondary'
                          disabled={item.quantity <= 0}
                          onClick={() => openSaleModal(item)}
                        >
                          Продать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sales' && (
        <div className='space-y-4'>
          <div className='flex gap-2'>
            <input
              className='input flex-1'
              placeholder='Поиск по номеру, клиенту, товару...'
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
            />
            <button className='btn' onClick={() => openSaleModal()}>
              + Продажа
            </button>
          </div>

          {salesLoading ? (
            <div className='text-muted p-6'>Загрузка...</div>
          ) : sales.length === 0 ? (
            <div className='card p-8 text-center text-muted'>Продаж пока нет</div>
          ) : (
            <div className='card overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left text-muted border-b border-border'>
                    <th className='p-3'>№</th>
                    <th className='p-3'>Дата</th>
                    <th className='p-3'>Клиент</th>
                    <th className='p-3'>Товары</th>
                    <th className='p-3'>Сумма</th>
                    <th className='p-3'>Себест.</th>
                    <th className='p-3'></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const cost =
                      sale.estimatedCost ??
                      sale.items.reduce(
                        (s, i) => s + Number(i.purchasePrice || 0) * Number(i.quantity || 0),
                        0
                      )
                    return (
                      <tr key={sale.id} className='border-t border-border hover:bg-surface/50'>
                        <td className='p-3 font-medium'>{sale.orderNumber}</td>
                        <td className='p-3 text-muted'>
                          {sale.createdAt ? new Date(sale.createdAt).toLocaleString('ru-RU') : '—'}
                        </td>
                        <td className='p-3'>
                          <div>{sale.clientName}</div>
                          {sale.clientPhone ? <div className='text-xs text-muted'>{sale.clientPhone}</div> : null}
                        </td>
                        <td className='p-3 text-muted'>
                          {sale.items?.slice(0, 2).map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                          {sale.items?.length > 2 ? ` +${sale.items.length - 2}` : ''}
                        </td>
                        <td className='p-3 font-medium'>{Number(sale.total || 0).toLocaleString('ru-RU')} ₽</td>
                        <td className='p-3 text-muted'>{Number(cost || 0).toLocaleString('ru-RU')} ₽</td>
                        <td className='p-3 text-right space-x-2 whitespace-nowrap'>
                          <button className='btn secondary' onClick={() => setSelectedSale(sale)}>
                            Открыть
                          </button>
                          <button className='btn secondary' onClick={() => printInvoiceForOrder(sale.id)}>
                            Накладная
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className='space-y-4'>
          {statsLoading || !stats ? (
            <div className='text-muted p-6'>Загрузка...</div>
          ) : (
            <>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                <div className='card p-4'>
                  <div className='text-sm text-muted mb-1'>Продаж</div>
                  <div className='text-2xl font-bold'>{stats.totalOrders}</div>
                </div>
                <div className='card p-4'>
                  <div className='text-sm text-muted mb-1'>Выручка</div>
                  <div className='text-2xl font-bold'>{Number(stats.totalRevenue || 0).toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className='card p-4'>
                  <div className='text-sm text-muted mb-1'>Позиций на складе</div>
                  <div className='text-2xl font-bold'>{stats.totalProducts}</div>
                </div>
                <div className='card p-4'>
                  <div className='text-sm text-muted mb-1'>В наличии</div>
                  <div className='text-2xl font-bold'>{stats.activeProducts}</div>
                </div>
              </div>
              {stats.popularProducts?.length > 0 && (
                <div className='card p-4'>
                  <h3 className='font-medium mb-3'>Позиции с остатком</h3>
                  <div className='space-y-2'>
                    {stats.popularProducts.map((p) => (
                      <div key={p.id} className='flex justify-between text-sm border-b border-border pb-2'>
                        <span>{p.name}</span>
                        <span className='text-muted'>{Number(p.price || 0).toLocaleString('ru-RU')} ₽</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {openSale && (
        <Modal
          title='Новая продажа'
          onClose={() => {
            if (!saving) {
              setOpenSale(false)
              resetSaleForm()
            }
          }}
        >
          <div className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Покупатель</label>
                <input
                  className='input'
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder='Розничный покупатель'
                />
              </div>
              <div>
                <label className='label'>Телефон</label>
                <input
                  className='input'
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder='+7...'
                />
              </div>
              <div>
                <label className='label'>Email (опц.)</label>
                <input className='input' value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div>
                <label className='label'>Категория аналитики</label>
                <Select
                  className='select'
                  value={saleCategory}
                  onChange={(e) => setSaleCategory(e.target.value as SaleCategoryId)}
                >
                  {SALE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className='label'>Способ оплаты</label>
              <div className='grid grid-cols-2 gap-2'>
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type='button'
                    className={`p-3 rounded-xl border transition ${
                      paymentMethod === m.id
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-border hover:bg-surface'
                    }`}
                    onClick={() => setPaymentMethod(m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            <div className='p-3 rounded-xl border border-border space-y-3'>
              <div className='font-medium'>Товары со склада</div>
              <div className='grid md:grid-cols-4 gap-2'>
                <div className='md:col-span-2'>
                  <Select className='select' value={pickItemId} onChange={(e) => setPickItemId(e.target.value)}>
                    <option value=''>Выберите товар...</option>
                    {catalogAvailable.map((i) => (
                      <option key={i.id} value={String(i.id)}>
                        {i.name} — {i.quantity} шт · {Number(i.salePrice || 0).toLocaleString('ru-RU')} ₽
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <input
                    className='input'
                    type='number'
                    min='1'
                    step='1'
                    value={pickQty}
                    onChange={(e) => setPickQty(e.target.value)}
                    placeholder='Кол-во'
                  />
                </div>
                <div>
                  <input
                    className='input'
                    type='number'
                    min='0'
                    step='0.01'
                    value={pickPrice}
                    onChange={(e) => setPickPrice(e.target.value)}
                    placeholder='Цена'
                  />
                </div>
              </div>
              {pickItem ? (
                <div className='text-xs text-muted'>
                  Остаток: {pickItem.quantity} · Закуп: {Number(pickItem.purchasePrice || 0).toLocaleString('ru-RU')} ₽
                  {pickItem.categoryName ? ` · ${pickItem.categoryName}` : ''}
                </div>
              ) : null}
              <button type='button' className='btn secondary' onClick={addLine}>
                Добавить в чек
              </button>

              {lines.length > 0 && (
                <div className='space-y-2 pt-2 border-t border-border'>
                  {lines.map((l) => (
                    <div key={l.itemId} className='flex flex-col sm:flex-row gap-2 items-start sm:items-center'>
                      <div className='flex-1 min-w-0'>
                        <div className='font-medium truncate'>{l.name}</div>
                        <div className='text-xs text-muted'>
                          макс. {l.maxQty} · закуп {(l.purchasePrice * l.quantity).toLocaleString('ru-RU')} ₽
                        </div>
                      </div>
                      <input
                        className='input w-24'
                        type='number'
                        min='1'
                        max={l.maxQty}
                        value={l.quantity}
                        onChange={(e) => updateLineQty(l.itemId, e.target.value)}
                      />
                      <input
                        className='input w-28'
                        type='number'
                        min='0'
                        step='0.01'
                        value={l.price}
                        onChange={(e) => updateLinePrice(l.itemId, e.target.value)}
                      />
                      <div className='w-24 text-right font-medium'>
                        {(l.price * l.quantity).toLocaleString('ru-RU')} ₽
                      </div>
                      <button
                        type='button'
                        className='btn ghost'
                        onClick={() => setLines((prev) => prev.filter((x) => x.itemId !== l.itemId))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className='label'>Комментарий</label>
              <textarea
                className='textarea'
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Скидка, примечание к накладной...'
              />
            </div>

            <label className='flex items-center gap-2 cursor-pointer'>
              <input type='checkbox' checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />
              <span className='text-sm'>Печатать накладную после продажи</span>
            </label>

            <div className='p-4 bg-surface rounded-xl space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted'>Сумма продажи</span>
                <span className='font-semibold'>{saleSubtotal.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted'>Себестоимость</span>
                <span>{saleCost.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between pt-2 border-t border-border'>
                <span className='font-medium'>Прибыль</span>
                <span className={`font-bold ${saleProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {saleProfit.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>

            <div className='flex gap-2 justify-end pt-2 border-t border-border'>
              <button
                className='btn secondary'
                disabled={saving}
                onClick={() => {
                  setOpenSale(false)
                  resetSaleForm()
                }}
              >
                Отмена
              </button>
              <button className='btn' disabled={saving || lines.length === 0} onClick={submitSale}>
                {saving ? 'Проведение...' : 'Провести продажу'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectedSale && (
        <Modal title={`Продажа ${selectedSale.orderNumber}`} onClose={() => setSelectedSale(null)}>
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <div className='text-muted'>Клиент</div>
                <div className='font-medium'>{selectedSale.clientName}</div>
              </div>
              <div>
                <div className='text-muted'>Телефон</div>
                <div className='font-medium'>{selectedSale.clientPhone || '—'}</div>
              </div>
              <div>
                <div className='text-muted'>Сумма</div>
                <div className='font-medium'>{Number(selectedSale.total || 0).toLocaleString('ru-RU')} ₽</div>
              </div>
              <div>
                <div className='text-muted'>Оплата</div>
                <div className='font-medium'>
                  {PAYMENT_METHODS.find((m) => m.id === selectedSale.paymentMethod)?.name ||
                    selectedSale.paymentMethod ||
                    '—'}
                </div>
              </div>
            </div>
            <div className='space-y-1 text-sm'>
              {selectedSale.items?.map((i, idx) => (
                <div key={idx} className='flex justify-between border-b border-border py-1'>
                  <span>
                    {i.name} × {i.quantity}
                  </span>
                  <span>{(Number(i.price) * Number(i.quantity)).toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
            <div className='flex gap-2 justify-end'>
              <button className='btn secondary' onClick={() => setSelectedSale(null)}>
                Закрыть
              </button>
              <button className='btn' onClick={() => printInvoiceForOrder(selectedSale.id)}>
                Печать накладной
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
