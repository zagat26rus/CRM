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

type CartLine = {
  itemId: number
  name: string
  sku?: string
  quantity: number
  price: number
  purchasePrice: number
  maxQty: number
  unit?: string
  categoryName?: string | null
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

const CART_LS_KEY = 'fixnet-shop-cart-v1'

function loadCartFromStorage(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(CART_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function Shop() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart' | 'sales' | 'stats'>('catalog')

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

  const [cart, setCart] = useState<CartLine[]>(() => loadCartFromStorage())
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<ShopSale | null>(null)
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({})

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleCategory, setSaleCategory] = useState<SaleCategoryId>('tech')
  const [printAfter, setPrintAfter] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_LS_KEY, JSON.stringify(cart))
    } catch {}
  }, [cart])

  useEffect(() => {
    if (activeTab === 'catalog' || activeTab === 'cart') {
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

  // Подтянуть актуальные maxQty после обновления каталога (не выкидываем позиции из корзины при фильтре)
  useEffect(() => {
    if (!items.length || !cart.length) return
    setCart((prev) => {
      let changed = false
      const next = prev.map((line) => {
        const stock = items.find((i) => i.id === line.itemId)
        if (!stock) return line
        const maxQty = Number(stock.quantity || 0)
        const quantity = Math.min(line.quantity, Math.max(maxQty, 0))
        if (
          maxQty !== line.maxQty ||
          quantity !== line.quantity ||
          Number(stock.purchasePrice || 0) !== line.purchasePrice
        ) {
          changed = true
        }
        return {
          ...line,
          maxQty,
          purchasePrice: Number(stock.purchasePrice || line.purchasePrice || 0),
          quantity: quantity > 0 ? quantity : line.quantity,
          name: stock.name || line.name,
          sku: stock.sku,
          unit: stock.unit,
          categoryName: stock.categoryName,
        }
      })
      return changed ? next : prev
    })
  }, [items])

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

  function cartQtyOf(itemId: number) {
    return cart.find((l) => l.itemId === itemId)?.quantity || 0
  }

  function addToCart(item: StockItem, addQty = 1) {
    if (item.quantity <= 0) return toast.push('Нет на складе')
    const qty = Math.max(1, Math.floor(Number(addQty) || 1))
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === item.id)
      if (existing) {
        const nextQty = existing.quantity + qty
        if (nextQty > item.quantity) {
          toast.push(`На складе только ${item.quantity} ${item.unit || 'шт'}`)
          return prev.map((l) =>
            l.itemId === item.id ? { ...l, quantity: item.quantity, maxQty: item.quantity } : l
          )
        }
        toast.push(`В корзине: ${item.name} × ${nextQty}`)
        return prev.map((l) =>
          l.itemId === item.id
            ? { ...l, quantity: nextQty, maxQty: item.quantity, price: l.price || Number(item.salePrice || 0) }
            : l
        )
      }
      if (qty > item.quantity) {
        toast.push(`На складе только ${item.quantity}`)
        return prev
      }
      toast.push(`Добавлено в корзину: ${item.name}`)
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          quantity: qty,
          price: Number(item.salePrice || 0),
          purchasePrice: Number(item.purchasePrice || 0),
          maxQty: Number(item.quantity || 0),
          unit: item.unit,
          categoryName: item.categoryName,
        },
      ]
    })
  }

  function setCartLineQty(itemId: number, qtyRaw: number | string) {
    const qty = Math.floor(Number(qtyRaw) || 0)
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.itemId !== itemId) return l
          if (qty <= 0) return { ...l, quantity: 0 }
          return { ...l, quantity: Math.min(qty, l.maxQty) }
        })
        .filter((l) => l.quantity > 0)
    )
  }

  function setCartLinePrice(itemId: number, priceRaw: string) {
    const price = Number(priceRaw)
    if (!Number.isFinite(price) || price < 0) return
    setCart((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, price } : l)))
  }

  function removeFromCart(itemId: number) {
    setCart((prev) => prev.filter((l) => l.itemId !== itemId))
  }

  function clearCart() {
    setCart([])
    setQtyDraft({})
  }

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart])
  const cartSubtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart])
  const cartCost = useMemo(() => cart.reduce((s, l) => s + l.purchasePrice * l.quantity, 0), [cart])
  const cartProfit = cartSubtotal - cartCost

  function resetCheckoutForm() {
    setClientName('')
    setClientPhone('')
    setClientEmail('')
    setNotes('')
    setPaymentMethod('cash')
    setSaleCategory('tech')
    setPrintAfter(true)
  }

  function openCheckoutModal() {
    if (cart.length === 0) return toast.push('Корзина пуста — добавьте товары со склада')
    const invalid = cart.find((l) => l.quantity > l.maxQty)
    if (invalid) return toast.push(`Недостаточно «${invalid.name}» на складе`)
    setCheckoutOpen(true)
  }

  async function submitCheckout() {
    if (cart.length === 0) return toast.push('Корзина пуста')
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
          items: cart.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            price: l.price,
          })),
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || `Ошибка ${resp.status}`)

      toast.push(`Продажа ${data?.order?.orderNumber || ''} проведена: ${cart.length} поз., склад списан`)
      notifyBalanceChanged()
      clearCart()
      resetCheckoutForm()
      setCheckoutOpen(false)
      await loadCatalog()
      if (activeTab === 'sales') await loadSales()
      setActiveTab('sales')

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
    const orderItems = order.items || []

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
      ${orderItems
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

  return (
    <div className='space-y-4 pb-24'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-2xl font-bold'>Магазин</h1>
          <p className='text-sm text-muted mt-1'>Корзина · продажа со склада · списание · платежи · накладная</p>
        </div>
        <div className='flex gap-2'>
          <button className='btn secondary' onClick={() => setActiveTab('cart')}>
            Корзина{cartCount > 0 ? ` (${cartCount})` : ''}
          </button>
          <button className='btn' disabled={cart.length === 0} onClick={openCheckoutModal}>
            Оформить
          </button>
        </div>
      </div>

      <div className='flex gap-2 border-b border-border overflow-x-auto'>
        {(
          [
            ['catalog', 'Каталог склада'],
            ['cart', `Корзина${cartCount ? ` · ${cartCount}` : ''}`],
            ['sales', 'Продажи'],
            ['stats', 'Статистика'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 font-medium transition whitespace-nowrap ${
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
                    <th className='p-3'>Кол-во</th>
                    <th className='p-3'></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const inCart = cartQtyOf(item.id)
                    const draft = qtyDraft[item.id] ?? '1'
                    return (
                      <tr key={item.id} className='border-t border-border hover:bg-surface/50'>
                        <td className='p-3'>
                          <div className='font-medium'>{item.name}</div>
                          {item.sku ? <div className='text-xs text-muted'>{item.sku}</div> : null}
                          {inCart > 0 ? (
                            <div className='text-xs text-primary mt-1'>В корзине: {inCart}</div>
                          ) : null}
                        </td>
                        <td className='p-3 text-muted'>{item.categoryName || '—'}</td>
                        <td className='p-3'>
                          <span className={item.quantity > 0 ? 'text-green-500' : 'text-red-500'}>
                            {item.quantity} {item.unit || 'шт'}
                          </span>
                        </td>
                        <td className='p-3 text-muted'>{Number(item.purchasePrice || 0).toLocaleString('ru-RU')}</td>
                        <td className='p-3 font-medium'>{Number(item.salePrice || 0).toLocaleString('ru-RU')}</td>
                        <td className='p-3 w-24'>
                          <input
                            className='input w-20'
                            type='number'
                            min='1'
                            max={item.quantity}
                            disabled={item.quantity <= 0}
                            value={draft}
                            onChange={(e) => setQtyDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                          />
                        </td>
                        <td className='p-3 text-right whitespace-nowrap'>
                          <button
                            className='btn secondary'
                            disabled={item.quantity <= 0}
                            onClick={() => addToCart(item, Number(draft || 1))}
                          >
                            В корзину
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

      {activeTab === 'cart' && (
        <div className='space-y-4'>
          {cart.length === 0 ? (
            <div className='card p-8 text-center space-y-3'>
              <div className='text-muted'>Корзина пуста</div>
              <button className='btn' onClick={() => setActiveTab('catalog')}>
                Перейти в каталог
              </button>
            </div>
          ) : (
            <>
              <div className='card overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='text-left text-muted border-b border-border'>
                      <th className='p-3'>Товар</th>
                      <th className='p-3'>Категория</th>
                      <th className='p-3'>Кол-во</th>
                      <th className='p-3'>Цена, ₽</th>
                      <th className='p-3'>Сумма</th>
                      <th className='p-3'>Закуп</th>
                      <th className='p-3'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((line) => (
                      <tr key={line.itemId} className='border-t border-border'>
                        <td className='p-3'>
                          <div className='font-medium'>{line.name}</div>
                          <div className='text-xs text-muted'>макс. {line.maxQty} {line.unit || 'шт'}</div>
                        </td>
                        <td className='p-3 text-muted'>{line.categoryName || '—'}</td>
                        <td className='p-3'>
                          <div className='flex items-center gap-1'>
                            <button
                              type='button'
                              className='btn ghost px-2'
                              onClick={() => setCartLineQty(line.itemId, line.quantity - 1)}
                            >
                              −
                            </button>
                            <input
                              className='input w-16 text-center'
                              type='number'
                              min='1'
                              max={line.maxQty}
                              value={line.quantity}
                              onChange={(e) => setCartLineQty(line.itemId, e.target.value)}
                            />
                            <button
                              type='button'
                              className='btn ghost px-2'
                              disabled={line.quantity >= line.maxQty}
                              onClick={() => setCartLineQty(line.itemId, line.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className='p-3'>
                          <input
                            className='input w-28'
                            type='number'
                            min='0'
                            step='0.01'
                            value={line.price}
                            onChange={(e) => setCartLinePrice(line.itemId, e.target.value)}
                          />
                        </td>
                        <td className='p-3 font-medium'>
                          {(line.price * line.quantity).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className='p-3 text-muted'>
                          {(line.purchasePrice * line.quantity).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className='p-3 text-right'>
                          <button className='btn ghost' onClick={() => removeFromCart(line.itemId)}>
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className='card p-4 space-y-3'>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Позиций / штук</span>
                  <span>
                    {cart.length} / {cartCount}
                  </span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Сумма продажи</span>
                  <span className='font-semibold'>{cartSubtotal.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Себестоимость</span>
                  <span>{cartCost.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className='flex justify-between pt-2 border-t border-border'>
                  <span className='font-medium'>Прибыль</span>
                  <span className={`font-bold ${cartProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                    {cartProfit.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
                <div className='flex flex-wrap gap-2 justify-end pt-2'>
                  <button className='btn secondary' onClick={() => setActiveTab('catalog')}>
                    + Ещё товары
                  </button>
                  <button className='btn ghost' onClick={clearCart}>
                    Очистить
                  </button>
                  <button className='btn' onClick={openCheckoutModal}>
                    Оформить продажу
                  </button>
                </div>
              </div>
            </>
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
                          {sale.items?.slice(0, 3).map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                          {sale.items?.length > 3 ? ` +${sale.items.length - 3}` : ''}
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
            </>
          )}
        </div>
      )}

      {/* Sticky cart bar */}
      {cartCount > 0 && activeTab !== 'cart' && (
        <div className='fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-4 left-0 right-0 z-30 px-3 pointer-events-none'>
          <div className='max-w-3xl mx-auto pointer-events-auto card p-3 flex items-center justify-between gap-3 shadow-lg border border-primary/30'>
            <div className='min-w-0'>
              <div className='font-medium truncate'>
                Корзина: {cart.length} поз. · {cartCount} шт
              </div>
              <div className='text-sm text-muted'>{cartSubtotal.toLocaleString('ru-RU')} ₽</div>
            </div>
            <div className='flex gap-2 shrink-0'>
              <button className='btn secondary' onClick={() => setActiveTab('cart')}>
                Открыть
              </button>
              <button className='btn' onClick={openCheckoutModal}>
                Оформить
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <Modal
          title={`Оформление продажи · ${cart.length} поз.`}
          onClose={() => {
            if (!saving) setCheckoutOpen(false)
          }}
        >
          <div className='space-y-4'>
            <div className='p-3 rounded-xl border border-border space-y-2 max-h-48 overflow-auto'>
              {cart.map((l) => (
                <div key={l.itemId} className='flex justify-between gap-2 text-sm'>
                  <span className='truncate'>
                    {l.name} × {l.quantity}
                  </span>
                  <span className='shrink-0 font-medium'>
                    {(l.price * l.quantity).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              ))}
            </div>

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
                <span className='font-semibold'>{cartSubtotal.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted'>Себестоимость</span>
                <span>{cartCost.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between pt-2 border-t border-border'>
                <span className='font-medium'>Прибыль</span>
                <span className={`font-bold ${cartProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cartProfit.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>

            <div className='flex gap-2 justify-end pt-2 border-t border-border'>
              <button className='btn secondary' disabled={saving} onClick={() => setCheckoutOpen(false)}>
                Назад к корзине
              </button>
              <button className='btn' disabled={saving || cart.length === 0} onClick={submitCheckout}>
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
