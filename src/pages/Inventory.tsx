import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'
import { apiFetch, apiUrl } from '../api'
import { notifyBalanceChanged } from '../utils/balanceEvents'
import { SALE_CATEGORIES, type SaleCategoryId } from '../utils/saleCategories'

type InventorySupplier = {
  id: number
  name: string
  phone?: string
  contactPerson?: string
  notes?: string
}

type InventoryCategory = {
  id: number
  name: string
  description?: string
}

type InventoryWarehouse = {
  id: number
  name: string
  description?: string
  address?: string
  isActive?: boolean
  isDefault?: boolean
}

type InventoryItem = {
  id: number
  name: string
  sku?: string
  supplier?: string // legacy
  supplierId?: number | null
  supplierName?: string | null
  categoryId?: number | null
  categoryName?: string | null
  warehouseId?: number | null
  warehouseName?: string | null
  purchasePrice: number
  salePrice: number
  quantity: number
  unit?: string
  description?: string
  createdAt?: string
  updatedAt?: string
}



export default function Inventory() {
  const toast = useToast()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([])
  const [invCategories, setInvCategories] = useState<InventoryCategory[]>([])
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('')

  const [openAdd, setOpenAdd] = useState(false)
  const [sellItem, setSellItem] = useState<InventoryItem | null>(null)
  const [openAddSupplier, setOpenAddSupplier] = useState(false)
  const [openAddCategory, setOpenAddCategory] = useState(false)
  const [openAddWarehouse, setOpenAddWarehouse] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editWarehouse, setEditWarehouse] = useState<InventoryWarehouse | null>(null)
  const [receiptItem, setReceiptItem] = useState<InventoryItem | null>(null)

  // add form
  const [fName, setFName] = useState('')
  const [fSku, setFSku] = useState('')
  const [fSupplierId, setFSupplierId] = useState<string>('')
  const [fCategoryId, setFCategoryId] = useState<string>('')
  const [fWarehouseId, setFWarehouseId] = useState<string>('')
  const [fPurchasePrice, setFPurchasePrice] = useState('0')
  const [fSalePrice, setFSalePrice] = useState('0')
  const [fQty, setFQty] = useState('0')
  const [fUnit, setFUnit] = useState('шт')
  const [fDescription, setFDescription] = useState('')

  // add supplier/category/warehouse modal forms
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [wName, setWName] = useState('')
  const [wDescription, setWDescription] = useState('')
  const [wAddress, setWAddress] = useState('')
  const [wIsDefault, setWIsDefault] = useState(false)

  // sell form
  const [sQty, setSQty] = useState('1')
  const [sPricePerUnit, setSPricePerUnit] = useState('')
  const [sCostTotal, setSCostTotal] = useState('')
  const [sComment, setSComment] = useState('')
  const [sSaleCategory, setSSaleCategory] = useState<SaleCategoryId>('parts')
  const [sCustomer, setSCustomer] = useState('')

  // edit form
  const [eName, setEName] = useState('')
  const [eSku, setESku] = useState('')
  const [eSupplierId, setESupplierId] = useState<string>('')
  const [eCategoryId, setECategoryId] = useState<string>('')
  const [eWarehouseId, setEWarehouseId] = useState<string>('')
  const [ePurchasePrice, setEPurchasePrice] = useState('0')
  const [eSalePrice, setESalePrice] = useState('0')
  const [eQty, setEQty] = useState('0')
  const [eUnit, setEUnit] = useState('шт')
  const [eDescription, setEDescription] = useState('')

  // receipt form
  const [rQty, setRQty] = useState('1')
  const [rPurchasePricePerUnit, setRPurchasePricePerUnit] = useState('')
  const [rSupplierId, setRSupplierId] = useState<string>('')
  const [rComment, setRComment] = useState('')

  useEffect(() => {
    loadItems('')
    loadSuppliers()
    loadInvCategories()
    loadWarehouses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => loadItems(search), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const totals = useMemo(() => {
    const skuCount = items.length
    const units = items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)
    const purchaseValue = items.reduce((acc, i) => acc + (Number(i.purchasePrice) || 0) * (Number(i.quantity) || 0), 0)
    const saleValue = items.reduce((acc, i) => acc + (Number(i.salePrice) || 0) * (Number(i.quantity) || 0), 0)
    return { skuCount, units, purchaseValue, saleValue }
  }, [items])

  async function loadItems(q: string) {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q.trim())
      const queryString = params.toString()
      const url = queryString ? `/inventory/items?${queryString}` : '/inventory/items'
      const response = await apiFetch(url)
      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить склад')
    } finally {
      setLoading(false)
    }
  }

  async function loadSuppliers() {
    try {
      const resp = await apiFetch('/inventory/suppliers')
      const data = await resp.json()
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить поставщиков')
    }
  }

  async function loadInvCategories() {
    try {
      const resp = await apiFetch('/inventory/categories')
      const data = await resp.json()
      setInvCategories(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить категории склада')
    }
  }

  async function loadWarehouses() {
    try {
      const resp = await apiFetch('/inventory/warehouses')
      const data = await resp.json()
      setWarehouses(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить склады')
    }
  }

  function resetAddForm() {
    setFName('')
    setFSku('')
    setFSupplierId('')
    setFCategoryId('')
    setFWarehouseId('')
    setFPurchasePrice('0')
    setFSalePrice('0')
    setFQty('0')
    setFUnit('шт')
    setFDescription('')
  }

  async function createItem() {
    const name = fName.trim()
    if (!name) return toast.push('Введите название товара')
    if (!fWarehouseId) return toast.push('Выберите склад')

    const payload = {
      name,
      sku: fSku.trim(),
      supplierId: fSupplierId ? Number(fSupplierId) : null,
      categoryId: fCategoryId ? Number(fCategoryId) : null,
      warehouseId: fWarehouseId ? Number(fWarehouseId) : null,
      purchasePrice: Number(fPurchasePrice || 0),
      salePrice: Number(fSalePrice || 0),
      quantity: Number(fQty || 0),
      unit: fUnit.trim() || 'шт',
      description: fDescription.trim()
    }

    try {
      const resp = await apiFetch('/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Товар добавлен')
      setOpenAdd(false)
      resetAddForm()
      await loadItems(search)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось добавить товар')
    }
  }

  async function createSupplier() {
    const name = newSupplierName.trim()
    if (!name) return toast.push('Введите название поставщика')
    try {
      const resp = await apiFetch('/inventory/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      const created = await resp.json()
      toast.push('Поставщик добавлен')
      setOpenAddSupplier(false)
      setNewSupplierName('')
      await loadSuppliers()
      if (created?.id) setFSupplierId(String(created.id))
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось добавить поставщика')
    }
  }

  async function createInvCategory() {
    const name = newCategoryName.trim()
    if (!name) return toast.push('Введите название категории')
    try {
      const resp = await apiFetch('/inventory/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      const created = await resp.json()
      toast.push('Категория добавлена')
      setOpenAddCategory(false)
      setNewCategoryName('')
      await loadInvCategories()
      if (created?.id) setFCategoryId(String(created.id))
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось добавить категорию')
    }
  }

  async function createWarehouse() {
    const name = wName.trim()
    if (!name) return toast.push('Введите название склада')
    try {
      const resp = await apiFetch('/inventory/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: wDescription.trim(),
          address: wAddress.trim(),
          isDefault: wIsDefault
        })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Склад добавлен')
      setOpenAddWarehouse(false)
      setWName('')
      setWDescription('')
      setWAddress('')
      setWIsDefault(false)
      await loadWarehouses()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось добавить склад')
    }
  }

  async function updateWarehouse() {
    if (!editWarehouse) return
    const name = wName.trim()
    if (!name) return toast.push('Введите название склада')
    try {
      const resp = await apiFetch(`/inventory/warehouses/${editWarehouse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: wDescription.trim(),
          address: wAddress.trim(),
          isDefault: wIsDefault
        })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Склад обновлен')
      setEditWarehouse(null)
      setWName('')
      setWDescription('')
      setWAddress('')
      setWIsDefault(false)
      await loadWarehouses()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось обновить склад')
    }
  }

  async function deleteWarehouse(id: number) {
    if (!confirm('Удалить склад? Товары из этого склада не будут удалены, но склад будет отвязан.')) return
    try {
      const resp = await apiFetch(`/inventory/warehouses/${id}`, {
        method: 'DELETE'
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Склад удален')
      await loadWarehouses()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось удалить склад')
    }
  }

  async function updateItem() {
    if (!editItem) return

    const name = eName.trim()
    if (!name) return toast.push('Введите название товара')

    const payload = {
      name,
      sku: eSku.trim(),
      supplierId: eSupplierId ? Number(eSupplierId) : null,
      categoryId: eCategoryId ? Number(eCategoryId) : null,
      warehouseId: eWarehouseId ? Number(eWarehouseId) : null,
      purchasePrice: Number(ePurchasePrice || 0),
      salePrice: Number(eSalePrice || 0),
      quantity: Number(eQty || 0),
      unit: eUnit.trim() || 'шт',
      description: eDescription.trim()
    }

    try {
      const resp = await apiFetch(`/inventory/items/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Товар обновлён')
      setEditItem(null)
      await loadItems(search)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось обновить товар')
    }
  }

  async function receipt() {
    if (!receiptItem) return
    const qty = Number(rQty || 0)
    if (!Number.isFinite(qty) || qty <= 0) return toast.push('Введите количество > 0')

    const ppu =
      rPurchasePricePerUnit.trim() === '' ? Number(receiptItem.purchasePrice || 0) : Number(rPurchasePricePerUnit || 0)
    if (!Number.isFinite(ppu) || ppu < 0) return toast.push('Закупочная цена некорректная')

    try {
      const resp = await apiFetch('/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: receiptItem.id,
          quantity: qty,
          purchasePricePerUnit: ppu,
          supplierId: rSupplierId ? Number(rSupplierId) : null,
          comment: rComment.trim(),
          method: 'card'
        })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Приход проведён и записан в Платежи (расход)')
      setReceiptItem(null)
      setRQty('1')
      setRPurchasePricePerUnit('')
      setRSupplierId('')
      setRComment('')
      await loadItems(search)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось провести приход')
    }
  }

  async function sell() {
    if (!sellItem) return
    const qty = Number(sQty || 0)
    if (!Number.isFinite(qty) || qty <= 0) return toast.push('Введите количество > 0')
    if (qty > sellItem.quantity) return toast.push('Недостаточно на складе')

    const ppu =
      sPricePerUnit.trim() === '' ? Number(sellItem.salePrice || 0) : Number(sPricePerUnit || 0)
    if (!Number.isFinite(ppu) || ppu < 0) return toast.push('Цена некорректная')

    const costTotal = Math.max(0, Number(sCostTotal) || 0)

    try {
      const resp = await apiFetch('/inventory/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: sellItem.id,
          quantity: qty,
          pricePerUnit: ppu,
          costTotal,
          saleCategory: sSaleCategory,
          customer: sCustomer.trim(),
          comment: sComment.trim(),
          method: 'card'
        })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push('Продажа проведена и записана в Платежи')
      setSellItem(null)
      setSQty('1')
      setSPricePerUnit('')
      setSCostTotal('')
      setSComment('')
      setSCustomer('')
      notifyBalanceChanged()
      await loadItems(search)
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось провести продажу')
    }
  }

  const sellTotal = useMemo(() => {
    if (!sellItem) return 0
    const qty = Number(sQty || 0)
    const ppu = sPricePerUnit.trim() === '' ? Number(sellItem.salePrice || 0) : Number(sPricePerUnit || 0)
    if (!Number.isFinite(qty) || !Number.isFinite(ppu)) return 0
    return Math.round(qty * ppu * 100) / 100
  }, [sellItem, sQty, sPricePerUnit])

  const sellCost = useMemo(() => Math.max(0, Number(sCostTotal) || 0), [sCostTotal])

  useEffect(() => {
    if (!sellItem) return
    const qty = Number(sQty || 1)
    const cost = Math.round((Number(sellItem.purchasePrice) || 0) * qty * 100) / 100
    setSCostTotal(String(cost))
  }, [sellItem, sQty])

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>Склад</h1>
          <div className='text-sm text-muted mt-1'>Номенклатура, остатки и продажи</div>
        </div>
        <div className='flex gap-2 flex-wrap'>
          <input
            className='input w-64 hidden md:block'
            placeholder='Поиск по названию / артикулу / поставщику'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className='input'
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
          >
            <option value=''>Все склады</option>
            {warehouses.filter(w => w.isActive !== false).map(w => (
              <option key={w.id} value={String(w.id)}>{w.name}</option>
            ))}
          </Select>
          <button className='btn secondary' onClick={() => setOpenAddWarehouse(true)}>
            + Склад
          </button>
          <button className='btn' onClick={() => setOpenAdd(true)}>
            + Товар
          </button>
        </div>
      </div>

      <div className='grid md:grid-cols-4 gap-4'>
        {/* Left: summary */}
        <div className='card md:col-span-1'>
          <div className='card-inner space-y-4'>
            <div>
              <div className='font-semibold'>Сводка</div>
              <div className='text-muted text-sm mt-1'>По текущим остаткам</div>
            </div>

            <div className='space-y-3 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted'>Позиций</span>
                <span className='font-semibold'>{totals.skuCount}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted'>Единиц</span>
                <span className='font-semibold'>{totals.units}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted'>Себестоимость</span>
                <span className='font-semibold'>{Math.round(totals.purchaseValue).toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted'>Потенц. выручка</span>
                <span className='font-semibold'>{Math.round(totals.saleValue).toLocaleString('ru-RU')} ₽</span>
              </div>
            </div>

            <div className='pt-2'>
              <input
                className='input w-full md:hidden'
                placeholder='Поиск'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className='pt-4 border-t border-border'>
              <div className='font-semibold mb-2'>Склады</div>
              <div className='space-y-2 max-h-48 overflow-y-auto'>
                {warehouses.filter(w => w.isActive !== false).map(w => (
                  <div key={w.id} className='flex items-center justify-between gap-2 text-sm'>
                    <span className='flex-1 truncate'>{w.name} {w.isDefault && <span className='text-muted'>(по умолчанию)</span>}</span>
                    <button
                      className='btn ghost text-xs px-2 py-1'
                      onClick={() => {
                        setEditWarehouse(w)
                        setWName(w.name)
                        setWDescription(w.description || '')
                        setWAddress(w.address || '')
                        setWIsDefault(w.isDefault || false)
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                ))}
                {warehouses.filter(w => w.isActive !== false).length === 0 && (
                  <div className='text-xs text-muted'>Нет складов</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: table */}
        <div className='card md:col-span-3 overflow-hidden'>
          <div className='p-4 border-b border-border bg-surface/50 flex items-center justify-between gap-3'>
            <div className='font-semibold'>Товары</div>
            <div className='text-sm text-muted'>{loading ? 'Загрузка…' : `${items.length} шт.`}</div>
          </div>

          {loading ? (
            <div className='py-12 text-center text-muted'>
              <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
              <p className='mt-2'>Загрузка…</p>
            </div>
          ) : items.length === 0 ? (
            <div className='card-inner text-center text-muted py-20'>
              <div className='text-lg font-medium'>Склад пуст</div>
              <div className='text-sm mt-1'>Добавьте номенклатуру, чтобы вести остатки и продажи</div>
              <div className='mt-6'>
                <button className='btn' onClick={() => setOpenAdd(true)}>
                  + Добавить первый товар
                </button>
              </div>
            </div>
          ) : (
            <div className='overflow-auto'>
              <table className='table min-w-[980px]'>
                <thead>
                  <tr>
                  <th>Склад</th>
                  <th>Категория</th>
                    <th>Товар</th>
                    <th>Поставщик</th>
                    <th>Закуп, ₽</th>
                    <th>Продажа, ₽</th>
                    <th>Остаток</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter(i => !warehouseFilter || (i.warehouseId && String(i.warehouseId) === warehouseFilter))
                    .map((i) => (
                    <tr key={i.id} className='hover:bg-surface/30 transition-colors'>
                    <td className='text-muted'>{i.warehouseName || '-'}</td>
                    <td className='text-muted'>{i.categoryName || '-'}</td>
                      <td>
                        <div className='font-medium'>{i.name}</div>
                        <div className='text-xs text-muted'>
                          {i.sku ? <>Арт: {i.sku}</> : <>ID: {i.id}</>}
                          {i.description ? <> • {i.description}</> : null}
                        </div>
                      </td>
                    <td className='text-muted'>{i.supplierName || i.supplier || '-'}</td>
                      <td className='text-muted'>{Number(i.purchasePrice || 0).toLocaleString('ru-RU')}</td>
                      <td className='text-muted'>{Number(i.salePrice || 0).toLocaleString('ru-RU')}</td>
                      <td>
                        <span className={`font-semibold ${i.quantity <= 0 ? 'text-danger' : ''}`}>
                          {i.quantity} {i.unit || 'шт'}
                        </span>
                      </td>
                      <td className='text-right'>
                      <div className='flex justify-end gap-2'>
                        <button
                          className='btn secondary'
                          onClick={() => {
                            setReceiptItem(i)
                            setRQty('1')
                            setRPurchasePricePerUnit('')
                            setRSupplierId(i.supplierId ? String(i.supplierId) : '')
                            setRComment('')
                          }}
                        >
                          Приход
                        </button>
                        <button
                          className='btn secondary'
                          onClick={() => {
                            setEditItem(i)
                            setEName(i.name || '')
                            setESku(i.sku || '')
                            setESupplierId(i.supplierId ? String(i.supplierId) : '')
                            setECategoryId(i.categoryId ? String(i.categoryId) : '')
                            setEWarehouseId(i.warehouseId ? String(i.warehouseId) : '')
                            setEPurchasePrice(String(i.purchasePrice ?? 0))
                            setESalePrice(String(i.salePrice ?? 0))
                            setEQty(String(i.quantity ?? 0))
                            setEUnit(i.unit || 'шт')
                            setEDescription(i.description || '')
                          }}
                        >
                          Редактировать
                        </button>
                        <button
                          className='btn secondary'
                          disabled={i.quantity <= 0}
                          onClick={() => {
                            setSellItem(i)
                            setSQty('1')
                            setSPricePerUnit('')
                            setSCostTotal(String(Math.round((Number(i.purchasePrice) || 0) * 100) / 100))
                            setSComment('')
                            setSCustomer('')
                          }}
                        >
                          Продать
                        </button>
                      </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {openAdd && (
        <Modal
          title='Добавить товар на склад'
          onClose={() => {
            setOpenAdd(false)
          }}
        >
          <div className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Склад *</label>
                <Select className='select' value={fWarehouseId} onChange={(e) => setFWarehouseId(e.target.value)}>
                  <option value=''>— Выберите склад —</option>
                  {warehouses.filter(w => w.isActive !== false).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.isDefault ? '(по умолчанию)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className='label'>Категория (номенклатура)</label>
                <div className='flex gap-2'>
                  <Select className='select flex-1' value={fCategoryId} onChange={(e) => setFCategoryId(e.target.value)}>
                    <option value=''>— Выберите —</option>
                    {invCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <button type='button' className='btn secondary' onClick={() => setOpenAddCategory(true)}>
                    Добавить
                  </button>
                </div>
              </div>
              <div>
                <label className='label'>Название *</label>
                <input className='input' value={fName} onChange={(e) => setFName(e.target.value)} placeholder='Напр. Дисплей iPhone 14' />
              </div>
              <div>
                <label className='label'>Артикул / SKU</label>
                <input className='input' value={fSku} onChange={(e) => setFSku(e.target.value)} placeholder='Напр. IP14-DISPLAY-01' />
              </div>
              <div>
                <label className='label'>Поставщик</label>
                <div className='flex gap-2'>
                  <Select className='select flex-1' value={fSupplierId} onChange={(e) => setFSupplierId(e.target.value)}>
                    <option value=''>— Выберите —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <button type='button' className='btn secondary' onClick={() => setOpenAddSupplier(true)}>
                    Добавить
                  </button>
                </div>
              </div>
              <div>
                <label className='label'>Ед. измерения</label>
                <input className='input' value={fUnit} onChange={(e) => setFUnit(e.target.value)} placeholder='шт' />
              </div>
              <div>
                <label className='label'>Закупочная цена, ₽</label>
                <input className='input' type='number' min='0' step='0.01' value={fPurchasePrice} onChange={(e) => setFPurchasePrice(e.target.value)} />
              </div>
              <div>
                <label className='label'>Продажная цена, ₽</label>
                <input className='input' type='number' min='0' step='0.01' value={fSalePrice} onChange={(e) => setFSalePrice(e.target.value)} />
              </div>
              <div>
                <label className='label'>Количество</label>
                <input className='input' type='number' min='0' step='1' value={fQty} onChange={(e) => setFQty(e.target.value)} />
              </div>
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' rows={3} value={fDescription} onChange={(e) => setFDescription(e.target.value)} placeholder='Цвет, совместимость, примечания…' />
            </div>

            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setOpenAdd(false)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={createItem}>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {openAddSupplier && (
        <Modal title='Добавить поставщика' onClose={() => setOpenAddSupplier(false)}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input className='input' value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder='Напр. PartsHub' autoFocus />
            </div>
            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setOpenAddSupplier(false)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={createSupplier}>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {openAddCategory && (
        <Modal title='Добавить категорию номенклатуры' onClose={() => setOpenAddCategory(false)}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input className='input' value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder='Напр. Дисплей' autoFocus />
            </div>
            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setOpenAddCategory(false)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={createInvCategory}>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {sellItem && (
        <Modal title={`Продать: ${sellItem.name}`} onClose={() => setSellItem(null)}>
          <div className='space-y-4'>
            <div className='text-sm text-muted'>
              Остаток: <span className='font-semibold text-text'>{sellItem.quantity} {sellItem.unit || 'шт'}</span>
            </div>

            <div className='grid md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Количество *</label>
                <input className='input' type='number' min='1' step='1' value={sQty} onChange={(e) => setSQty(e.target.value)} />
              </div>
              <div>
                <label className='label'>Цена за единицу, ₽</label>
                <input
                  className='input'
                  type='number'
                  min='0'
                  step='0.01'
                  value={sPricePerUnit}
                  onChange={(e) => setSPricePerUnit(e.target.value)}
                  placeholder={String(sellItem.salePrice || 0)}
                />
                <div className='text-xs text-muted mt-1'>Пусто = взять “Продажная цена” товара</div>
              </div>
              <div>
                <label className='label'>Покупатель (опц.)</label>
                <input className='input' value={sCustomer} onChange={(e) => setSCustomer(e.target.value)} placeholder='Имя/контакт' />
              </div>
            </div>

            <div>
              <label className='label'>Категория для аналитики</label>
              <Select className='select' value={sSaleCategory} onChange={(e) => setSSaleCategory(e.target.value as SaleCategoryId)}>
                {SALE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className='label'>Себестоимость / расходы, ₽</label>
              <input
                className='input'
                type='number'
                min='0'
                step='0.01'
                value={sCostTotal}
                onChange={(e) => setSCostTotal(e.target.value)}
              />
              <div className='text-xs text-muted mt-1'>По умолчанию: закупочная цена × количество</div>
            </div>

            <div>
              <label className='label'>Комментарий (опц.)</label>
              <textarea className='textarea' rows={3} value={sComment} onChange={(e) => setSComment(e.target.value)} placeholder='Напр. Продажа витрина / оплата наличные / скидка…' />
            </div>

            <div className='p-4 bg-surface/50 rounded-xl space-y-2'>
              <div className='flex justify-between'>
                <span className='text-muted'>Сумма продажи</span>
                <span className='text-lg font-semibold'>{sellTotal.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted'>Себестоимость</span>
                <span>{sellCost.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className='flex justify-between pt-2 border-t border-border'>
                <span className='font-medium'>Чистая прибыль</span>
                <span className={`font-bold text-lg ${sellTotal - sellCost >= 0 ? 'text-success' : 'text-danger'}`}>
                  {(sellTotal - sellCost).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>

            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setSellItem(null)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={sell} disabled={Number(sQty || 0) <= 0}>
                Провести продажу
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editItem && (
        <Modal title={`Редактировать: ${editItem.name}`} onClose={() => setEditItem(null)}>
          <div className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Склад *</label>
                <Select className='select' value={eWarehouseId} onChange={(e) => setEWarehouseId(e.target.value)}>
                  <option value=''>— Выберите склад —</option>
                  {warehouses.filter(w => w.isActive !== false).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.isDefault ? '(по умолчанию)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className='label'>Категория</label>
                <div className='flex gap-2'>
                  <Select className='select flex-1' value={eCategoryId} onChange={(e) => setECategoryId(e.target.value)}>
                    <option value=''>— Не выбрано —</option>
                    {invCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <button type='button' className='btn secondary' onClick={() => setOpenAddCategory(true)}>
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className='label'>Название *</label>
                <input className='input' value={eName} onChange={(e) => setEName(e.target.value)} />
              </div>
              <div>
                <label className='label'>Артикул / SKU</label>
                <input className='input' value={eSku} onChange={(e) => setESku(e.target.value)} />
              </div>
              <div>
                <label className='label'>Поставщик</label>
                <div className='flex gap-2'>
                  <Select className='select flex-1' value={eSupplierId} onChange={(e) => setESupplierId(e.target.value)}>
                    <option value=''>— Не выбрано —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <button type='button' className='btn secondary' onClick={() => setOpenAddSupplier(true)}>
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className='label'>Закупочная цена, ₽</label>
                <input className='input' type='number' min='0' step='0.01' value={ePurchasePrice} onChange={(e) => setEPurchasePrice(e.target.value)} />
              </div>
              <div>
                <label className='label'>Продажная цена, ₽</label>
                <input className='input' type='number' min='0' step='0.01' value={eSalePrice} onChange={(e) => setESalePrice(e.target.value)} />
              </div>
              <div>
                <label className='label'>Количество</label>
                <input className='input' type='number' min='0' step='1' value={eQty} onChange={(e) => setEQty(e.target.value)} />
              </div>
              <div>
                <label className='label'>Ед. измерения</label>
                <input className='input' value={eUnit} onChange={(e) => setEUnit(e.target.value)} />
              </div>
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' rows={3} value={eDescription} onChange={(e) => setEDescription(e.target.value)} />
            </div>
            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setEditItem(null)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={updateItem}>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {receiptItem && (
        <Modal title={`Приход: ${receiptItem.name}`} onClose={() => setReceiptItem(null)}>
          <div className='space-y-4'>
            <div className='text-sm text-muted'>
              Текущий остаток: <span className='font-semibold text-text'>{receiptItem.quantity} {receiptItem.unit || 'шт'}</span>
            </div>

            <div className='grid md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Количество *</label>
                <input className='input' type='number' min='1' step='1' value={rQty} onChange={(e) => setRQty(e.target.value)} />
              </div>
              <div>
                <label className='label'>Закупочная цена за ед., ₽</label>
                <input
                  className='input'
                  type='number'
                  min='0'
                  step='0.01'
                  value={rPurchasePricePerUnit}
                  onChange={(e) => setRPurchasePricePerUnit(e.target.value)}
                  placeholder={String(receiptItem.purchasePrice || 0)}
                />
                <div className='text-xs text-muted mt-1'>Пусто = взять “Закупочная цена” товара</div>
              </div>
              <div className='md:col-span-2'>
                <label className='label'>Поставщик (опц.)</label>
                <div className='flex gap-2'>
                  <Select className='select flex-1' value={rSupplierId} onChange={(e) => setRSupplierId(e.target.value)}>
                    <option value=''>— Не выбрано —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <button type='button' className='btn secondary' onClick={() => setOpenAddSupplier(true)}>
                    Добавить
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className='label'>Комментарий (опц.)</label>
              <textarea className='textarea' rows={3} value={rComment} onChange={(e) => setRComment(e.target.value)} placeholder='Напр. Накладная №..., партия...' />
            </div>

            <div className='p-4 bg-surface/50 rounded-xl'>
              <div className='flex justify-between'>
                <span className='text-muted'>Сумма закупки</span>
                <span className='text-lg font-semibold'>
                  {(() => {
                    const qty = Number(rQty || 0)
                    const ppu = rPurchasePricePerUnit.trim() === '' ? Number(receiptItem.purchasePrice || 0) : Number(rPurchasePricePerUnit || 0)
                    const total = Number.isFinite(qty) && Number.isFinite(ppu) ? Math.round(qty * ppu * 100) / 100 : 0
                    return `${total.toLocaleString('ru-RU')} ₽`
                  })()}
                </span>
              </div>
              <div className='text-xs text-muted mt-1'>Будет записано в “Платежи” как расход (категория “Закупка на склад”).</div>
            </div>

            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => setReceiptItem(null)}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={receipt} disabled={Number(rQty || 0) <= 0}>
                Провести приход
              </button>
            </div>
          </div>
        </Modal>
      )}

      {openAddWarehouse && (
        <Modal title='Добавить склад' onClose={() => {
          setOpenAddWarehouse(false)
          setWName('')
          setWDescription('')
          setWAddress('')
          setWIsDefault(false)
        }}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input className='input' value={wName} onChange={(e) => setWName(e.target.value)} placeholder='Напр. Склад опт, Склад розница' autoFocus />
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' rows={2} value={wDescription} onChange={(e) => setWDescription(e.target.value)} placeholder='Описание склада' />
            </div>
            <div>
              <label className='label'>Адрес</label>
              <input className='input' value={wAddress} onChange={(e) => setWAddress(e.target.value)} placeholder='Адрес склада' />
            </div>
            <div>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input type='checkbox' checked={wIsDefault} onChange={(e) => setWIsDefault(e.target.checked)} className='w-4 h-4' />
                <span className='text-sm'>Склад по умолчанию</span>
              </label>
            </div>
            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => {
                setOpenAddWarehouse(false)
                setWName('')
                setWDescription('')
                setWAddress('')
                setWIsDefault(false)
              }}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={createWarehouse}>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editWarehouse && (
        <Modal title={`Редактировать: ${editWarehouse.name}`} onClose={() => {
          setEditWarehouse(null)
          setWName('')
          setWDescription('')
          setWAddress('')
          setWIsDefault(false)
        }}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input className='input' value={wName} onChange={(e) => setWName(e.target.value)} />
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' rows={2} value={wDescription} onChange={(e) => setWDescription(e.target.value)} />
            </div>
            <div>
              <label className='label'>Адрес</label>
              <input className='input' value={wAddress} onChange={(e) => setWAddress(e.target.value)} />
            </div>
            <div>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input type='checkbox' checked={wIsDefault} onChange={(e) => setWIsDefault(e.target.checked)} className='w-4 h-4' />
                <span className='text-sm'>Склад по умолчанию</span>
              </label>
            </div>
            <div className='flex gap-2 pt-2'>
              <button className='btn secondary flex-1' onClick={() => {
                setEditWarehouse(null)
                setWName('')
                setWDescription('')
                setWAddress('')
                setWIsDefault(false)
              }}>
                Отмена
              </button>
              <button className='btn flex-1' onClick={updateWarehouse}>
                Сохранить
              </button>
            </div>
            <div className='pt-2 border-t border-border'>
              <button className='btn danger w-full' onClick={() => deleteWarehouse(editWarehouse.id)}>
                Удалить склад
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}