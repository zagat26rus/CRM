import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'
import { apiFetch } from '../api'
import { sortModelsByRelease } from '../utils/modelSort'

type ServiceCategory = {
  id: number
  name: string
  description?: string
  sortOrder?: number
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

type Service = {
  id: number
  name: string
  description?: string
  categoryId?: number | null
  categoryName?: string | null
  price: number
  duration?: number
  isActive: boolean
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

type BrandOption = { id: number; name: string }
type ModelOption = { id: number; brandId: number; name: string; deviceType: string; brandName?: string }

type CatalogPriceRow = {
  id?: number | null
  brandId: number
  brandName: string
  modelId: number
  modelName: string
  deviceType: string
  issueCode: string
  issueName: string
  subtypeId?: number | null
  subtypeName?: string | null
  partType: string
  cityCode?: string
  cityName?: string
  priceMin: number | null
  priceMax?: number | null
  durationMinutes?: number | null
  hasPrice?: boolean
}

type CatalogIssue = { code: string; name: string }
type CatalogCity = { code: string; name: string }

export default function Services() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'services' | 'categories' | 'catalog'>('catalog')

  // Services
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  // Modals
  const [openAddService, setOpenAddService] = useState(false)
  const [openAddCategory, setOpenAddCategory] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [editCategory, setEditCategory] = useState<ServiceCategory | null>(null)

  // Service form
  const [sName, setSName] = useState('')
  const [sDescription, setSDescription] = useState('')
  const [sCategoryId, setSCategoryId] = useState<string>('')
  const [sPrice, setSPrice] = useState('0')
  const [sDuration, setSDuration] = useState('0')
  const [sIsActive, setSIsActive] = useState(true)

  // Category form
  const [cName, setCName] = useState('')
  const [cDescription, setCDescription] = useState('')

  // Каталог цен с сайта
  const [catalogRows, setCatalogRows] = useState<CatalogPriceRow[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogPricedCount, setCatalogPricedCount] = useState(0)
  const [catalogUnpricedCount, setCatalogUnpricedCount] = useState(0)
  const [catalogIncludeMissing, setCatalogIncludeMissing] = useState(false)
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogPages, setCatalogPages] = useState(1)
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null)
  const [catalogDeviceTypes, setCatalogDeviceTypes] = useState<string[]>([])
  const [catalogIssues, setCatalogIssues] = useState<CatalogIssue[]>([])
  const [catalogBrands, setCatalogBrands] = useState<BrandOption[]>([])
  const [catalogModels, setCatalogModels] = useState<ModelOption[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogDeviceType, setCatalogDeviceType] = useState('')
  const [catalogBrandId, setCatalogBrandId] = useState('')
  const [catalogModelId, setCatalogModelId] = useState('')
  const [catalogIssueCode, setCatalogIssueCode] = useState('')
  const [catalogCityCode, setCatalogCityCode] = useState('')
  const [catalogCities, setCatalogCities] = useState<CatalogCity[]>([])
  const [catalogPartType, setCatalogPartType] = useState('original')
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    loadServices()
    loadCategories()
  }, [])

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadCatalogFilters()
    }
  }, [activeTab, catalogDeviceType, catalogBrandId, catalogModelId, catalogIssueCode, catalogPartType])

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadCatalogPrices()
    }
  }, [activeTab, catalogPage, catalogDeviceType, catalogBrandId, catalogModelId, catalogIssueCode, catalogCityCode, catalogPartType])

  function resetCatalogCascade(level: 'device' | 'brand' | 'model') {
    if (level === 'device') {
      setCatalogBrandId('')
      setCatalogModelId('')
      setCatalogIssueCode('')
    } else if (level === 'brand') {
      setCatalogModelId('')
      setCatalogIssueCode('')
    } else if (level === 'model') {
      setCatalogIssueCode('')
    }
    setCatalogPage(1)
  }

  useEffect(() => {
    if (activeTab !== 'catalog') return
    const timer = setTimeout(() => {
      setCatalogPage(1)
      loadCatalogPrices(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [catalogSearch])

  async function loadServices() {
    try {
      setLoading(true)
      const response = await apiFetch('/services')
      const data = await response.json()
      setServices(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить услуги')
    } finally {
      setLoading(false)
    }
  }

  async function loadCategories() {
    try {
      const response = await apiFetch('/services/categories')
      const data = await response.json()
      setCategories(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.push('Не удалось загрузить категории')
    }
  }

  async function loadCatalogFilters() {
    try {
      const params = new URLSearchParams()
      if (catalogDeviceType) params.set('deviceType', catalogDeviceType)
      if (catalogBrandId) params.set('brandId', catalogBrandId)
      if (catalogModelId) params.set('modelId', catalogModelId)
      if (catalogIssueCode) params.set('issueCode', catalogIssueCode)
      if (catalogPartType) params.set('partType', catalogPartType)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const response = await apiFetch(`/catalog/filters${qs}`)
      if (!response.ok) return
      const data = await response.json()
      if (Array.isArray(data.deviceTypes)) setCatalogDeviceTypes(data.deviceTypes)
      if (Array.isArray(data.brands)) {
        setCatalogBrands(data.brands)
        if (catalogBrandId && !data.brands.some((b: BrandOption) => String(b.id) === catalogBrandId)) {
          setCatalogBrandId('')
          setCatalogModelId('')
          setCatalogIssueCode('')
        }
      }
      if (Array.isArray(data.models)) {
        setCatalogModels(sortModelsByRelease(data.models))
        if (catalogModelId && !data.models.some((m: ModelOption) => String(m.id) === catalogModelId)) {
          setCatalogModelId('')
          setCatalogIssueCode('')
        }
      }
      if (Array.isArray(data.issues)) {
        setCatalogIssues(data.issues)
        if (catalogIssueCode && !data.issues.some((i: CatalogIssue) => i.code === catalogIssueCode)) {
          setCatalogIssueCode('')
        }
      }
      if (Array.isArray(data.cities)) {
        setCatalogCities(data.cities)
        if (catalogCityCode && !data.cities.some((c: CatalogCity) => c.code === catalogCityCode)) {
          setCatalogCityCode(data.cities[0]?.code || '')
        } else if (!catalogCityCode && data.cities.length > 0) {
          setCatalogCityCode(data.cities[0].code)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function loadCatalogPrices(pageOverride?: number) {
    try {
      setCatalogLoading(true)
      setCatalogError('')
      const page = pageOverride ?? catalogPage
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        partType: catalogPartType || 'original',
      })
      if (catalogSearch.trim()) params.set('search', catalogSearch.trim())
      if (catalogDeviceType) params.set('deviceType', catalogDeviceType)
      if (catalogBrandId) params.set('brandId', catalogBrandId)
      if (catalogModelId) params.set('modelId', catalogModelId)
      if (catalogIssueCode) params.set('issueCode', catalogIssueCode)
      if (catalogCityCode) params.set('cityCode', catalogCityCode)

      const response = await apiFetch(`/catalog/prices?${params.toString()}`)
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody?.error || `Ошибка ${response.status}`)
      }
      const data = await response.json()
      setCatalogRows(Array.isArray(data.items) ? data.items : [])
      setCatalogTotal(Number(data.total) || 0)
      setCatalogPricedCount(Number(data.pricedCount) || 0)
      setCatalogUnpricedCount(Number(data.unpricedCount) || 0)
      setCatalogIncludeMissing(Boolean(data.includeMissing))
      setCatalogPage(Number(data.page) || 1)
      setCatalogPages(Number(data.pages) || 1)
      setCatalogSyncedAt(data.syncedAt || null)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Ошибка загрузки'
      setCatalogError(msg)
      toast.push('Не удалось загрузить каталог. Перезапустите CRM backend (npm start).')
      setCatalogRows([])
    } finally {
      setCatalogLoading(false)
    }
  }

  function formatCatalogSyncedAt(value: string | null) {
    if (!value) return 'не синхронизирован'
    try {
      return new Date(value).toLocaleString('ru-RU')
    } catch {
      return value
    }
  }

  function partTypeLabel(partType: string) {
    if (partType === 'copy') return 'Копия'
    if (partType === 'original') return 'Оригинал'
    return partType
  }

  function resetServiceForm() {
    setSName('')
    setSDescription('')
    setSCategoryId('')
    setSPrice('0')
    setSDuration('0')
    setSIsActive(true)
  }

  function resetCategoryForm() {
    setCName('')
    setCDescription('')
  }

  function openEditService(service: Service) {
    setEditService(service)
    setSName(service.name)
    setSDescription(service.description || '')
    setSCategoryId(service.categoryId ? String(service.categoryId) : '')
    setSPrice(String(service.price || 0))
    setSDuration(String(service.duration || 0))
    setSIsActive(service.isActive !== false)
    setOpenAddService(true)
  }

  function openEditCategory(category: ServiceCategory) {
    setEditCategory(category)
    setCName(category.name)
    setCDescription(category.description || '')
    setOpenAddCategory(true)
  }

  async function saveService() {
    const name = sName.trim()
    if (!name) return toast.push('Введите название услуги')
    const price = Number(sPrice || 0)
    if (price < 0) return toast.push('Цена не может быть отрицательной')

    const payload = {
      name,
      description: sDescription.trim(),
      categoryId: sCategoryId ? Number(sCategoryId) : null,
      price,
      duration: Number(sDuration || 0)
    }

    try {
      const url = editService ? `/services/${editService.id}` : '/services'
      const method = editService ? 'PUT' : 'POST'
      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push(editService ? 'Услуга обновлена' : 'Услуга добавлена')
      setOpenAddService(false)
      setEditService(null)
      resetServiceForm()
      await loadServices()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось сохранить услугу')
    }
  }

  async function deleteService(id: number) {
    if (!confirm('Удалить услугу?')) return
    try {
      const resp = await apiFetch(`/services/${id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Ошибка удаления')
      toast.push('Услуга удалена')
      await loadServices()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось удалить услугу')
    }
  }

  async function saveCategory() {
    const name = cName.trim()
    if (!name) return toast.push('Введите название категории')

    try {
      const url = editCategory ? `/services/categories/${editCategory.id}` : '/services/categories'
      const method = editCategory ? 'PUT' : 'POST'
      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: cDescription.trim() })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      toast.push(editCategory ? 'Категория обновлена' : 'Категория добавлена')
      setOpenAddCategory(false)
      setEditCategory(null)
      resetCategoryForm()
      await loadCategories()
      if (activeTab === 'services') await loadServices()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось сохранить категорию')
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Удалить категорию?')) return
    try {
      const resp = await apiFetch(`/services/categories/${id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || 'Ошибка удаления')
      }
      toast.push('Категория удалена')
      await loadCategories()
      await loadServices()
    } catch (e: any) {
      console.error(e)
      toast.push(e?.message || 'Не удалось удалить категорию')
    }
  }

  const filteredServices = services.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.description || '').toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter && String(s.categoryId) !== categoryFilter) return false
    if (activeFilter === 'active' && !s.isActive) return false
    if (activeFilter === 'inactive' && s.isActive) return false
    return true
  })

  const filteredCategories = categories.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.description || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className='space-y-4'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <h1 className='text-2xl font-bold'>Услуги</h1>
        <div className='flex gap-2 w-full sm:w-auto'>
          {activeTab === 'services' && (
            <button onClick={() => { setOpenAddService(true); resetServiceForm(); setEditService(null) }} className='btn w-full sm:w-auto'>
              + Добавить услугу
            </button>
          )}
          {activeTab === 'categories' && (
            <button onClick={() => { setOpenAddCategory(true); resetCategoryForm(); setEditCategory(null) }} className='btn w-full sm:w-auto'>
              + Добавить категорию
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className='grid grid-cols-3 sm:flex gap-1 sm:gap-2 border-b border-border'>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === 'catalog' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-text'
          }`}
        >
          Каталог цен
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={`px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === 'services' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-text'
          }`}
        >
          Шаблоны услуг
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === 'categories' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-text'
          }`}
        >
          Категории
        </button>
      </div>

      {activeTab === 'services' && (
        <p className='text-sm text-muted'>
          Средние цены по типам поломок. Точные цены для конкретной модели — во вкладке «Каталог цен».
        </p>
      )}

      {/* Filters */}
      {activeTab !== 'catalog' && (
      <div className='flex gap-2 flex-wrap'>
        <input
          type='text'
          placeholder='Поиск...'
          value={search}
          onChange={e => setSearch(e.target.value)}
          className='input flex-1 min-w-[200px]'
        />
        {activeTab === 'services' && (
          <>
            <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className='select'>
              <option value=''>Все категории</option>
              {categories.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </Select>
            <Select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} className='select'>
              <option value=''>Все</option>
              <option value='active'>Активные</option>
              <option value='inactive'>Неактивные</option>
            </Select>
          </>
        )}
      </div>
      )}

      {/* Catalog Tab */}
      {activeTab === 'catalog' && (
        <div className='space-y-3'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted'>
            <span>
              Данные с сайта: бренд, модель, тип устройства и цена.{' '}
              Всего записей: <strong className='text-text'>{catalogTotal.toLocaleString('ru-RU')}</strong>
              {catalogIncludeMissing && (
                <>
                  {' '}· с ценой: <strong className='text-text'>{catalogPricedCount}</strong>
                  {' '}· без цены: <strong className='text-warning'>{catalogUnpricedCount}</strong>
                </>
              )}
              {!catalogModelId && catalogCityCode && (
                <span className='block sm:inline sm:ml-2 text-xs mt-1 sm:mt-0'>
                  Выберите модель — покажем все неисправности, в том числе без выставленной цены
                </span>
              )}
            </span>
            <span>Обновлено: {formatCatalogSyncedAt(catalogSyncedAt)}</span>
          </div>

          <div className='grid grid-cols-1 sm:flex gap-2 sm:flex-wrap'>
            <Select
              value={catalogDeviceType}
              onChange={(e) => {
                setCatalogDeviceType(e.target.value)
                resetCatalogCascade('device')
              }}
              className='select w-full sm:w-auto sm:min-w-[160px]'
            >
              <option value=''>Все типы устройств</option>
              {catalogDeviceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Select
              value={catalogBrandId}
              onChange={(e) => {
                setCatalogBrandId(e.target.value)
                resetCatalogCascade('brand')
              }}
              className='select w-full sm:w-auto sm:min-w-[140px]'
              disabled={!catalogDeviceType}
              title={!catalogDeviceType ? 'Сначала выберите тип устройства' : ''}
            >
              <option value=''>{catalogDeviceType ? 'Все бренды' : 'Сначала тип устройства'}</option>
              {catalogBrands.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </Select>
            <Select
              value={catalogModelId}
              onChange={(e) => {
                setCatalogModelId(e.target.value)
                resetCatalogCascade('model')
              }}
              className='select w-full sm:w-auto sm:min-w-[160px]'
              disabled={!catalogBrandId}
              title={!catalogBrandId ? 'Сначала выберите бренд' : ''}
            >
              <option value=''>{catalogBrandId ? 'Все модели' : 'Сначала бренд'}</option>
              {catalogModels.map((m) => (
                <option key={m.id} value={String(m.id)}>{m.name}</option>
              ))}
            </Select>
            <Select
              value={catalogIssueCode}
              onChange={(e) => { setCatalogIssueCode(e.target.value); setCatalogPage(1) }}
              className='select w-full sm:w-auto sm:min-w-[160px]'
              disabled={!catalogDeviceType}
              title={!catalogDeviceType ? 'Сначала выберите тип устройства' : ''}
            >
              <option value=''>{catalogDeviceType ? 'Все поломки' : 'Сначала тип устройства'}</option>
              {catalogIssues.map((i) => (
                <option key={i.code} value={i.code}>{i.name}</option>
              ))}
            </Select>
            <Select
              value={catalogCityCode}
              onChange={(e) => { setCatalogCityCode(e.target.value); setCatalogPage(1) }}
              className='select w-full sm:w-auto sm:min-w-[150px]'
            >
              <option value=''>Выберите город</option>
              {catalogCities.map((c) => (
                <option key={c.code} value={c.code}>{c.name || c.code}</option>
              ))}
            </Select>
            <input
              type='text'
              placeholder='Поиск...'
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className='input w-full sm:flex-1 sm:min-w-[140px]'
            />
            <Select
              value={catalogPartType}
              onChange={(e) => { setCatalogPartType(e.target.value); setCatalogPage(1) }}
              className='select w-full sm:w-auto'
            >
              <option value='original'>Оригинал</option>
              <option value='copy'>Копия</option>
            </Select>
          </div>

          <div className='card overflow-hidden'>
            {catalogLoading ? (
              <div className='card-inner text-center py-10 text-muted'>Загрузка каталога...</div>
            ) : catalogRows.length === 0 ? (
              <div className='card-inner text-center py-10 text-muted'>
                {catalogError ? (
                  <>
                    <p className='text-danger font-medium'>Не удалось загрузить каталог</p>
                    <p className='text-sm mt-2'>{catalogError}</p>
                  </>
                ) : catalogCities.length === 0 ? (
                  <>
                    <p>Каталог пуст или не синхронизирован.</p>
                    <p className='text-sm mt-2'>На сервере сайта: python manage.py sync_catalog_to_crm --company-id 1</p>
                  </>
                ) : (
                  <p>Нет записей по выбранным фильтрам. Сбросьте тип/бренд/поломку или выберите «Прайс CRM».</p>
                )}
              </div>
            ) : (
              <div className='overflow-auto'>
                <table className='w-full min-w-[980px] table-auto text-sm'>
                  <thead>
                    <tr>
                      <th className='w-[9%] text-left py-3 px-3'>Тип</th>
                      <th className='w-[8%] text-left py-3 px-3'>Бренд</th>
                      <th className='w-[9%] text-left py-3 px-3'>Модель</th>
                      <th className='w-[12%] text-left py-3 px-3'>Поломка</th>
                      <th className='w-[28%] text-left py-3 px-3'>Подтип</th>
                      <th className='w-[8%] text-left py-3 px-3'>Запчасть</th>
                      <th className='w-[10%] text-left py-3 px-3'>Цена</th>
                      <th className='w-[8%] text-left py-3 px-3'>Время</th>
                      <th className='w-[8%] text-left py-3 px-3'>Город</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogRows.map((row) => {
                      const hasPrice = row.hasPrice !== false && row.priceMin != null
                      const rowKey = row.id ?? `${row.issueCode}-${row.subtypeId ?? 0}-${row.partType}`
                      return (
                      <tr
                        key={rowKey}
                        className={hasPrice ? 'hover:bg-surface/30' : 'bg-warning/5 hover:bg-warning/10'}
                      >
                        <td className='py-3 px-3 border-t border-border whitespace-nowrap'>{row.deviceType}</td>
                        <td className='py-3 px-3 border-t border-border font-medium whitespace-nowrap'>{row.brandName}</td>
                        <td className='py-3 px-3 border-t border-border whitespace-nowrap'>{row.modelName}</td>
                        <td className='py-3 px-3 border-t border-border'>{row.issueName}</td>
                        <td className='py-3 px-3 border-t border-border text-muted break-words'>
                          {row.subtypeName || '—'}
                        </td>
                        <td className='py-3 px-3 border-t border-border'>{partTypeLabel(row.partType)}</td>
                        <td className={`py-3 px-3 border-t border-border whitespace-nowrap ${hasPrice ? 'font-semibold' : 'text-warning'}`}>
                          {hasPrice ? (
                            <>
                              {row.priceMin!.toLocaleString('ru-RU')} ₽
                              {row.priceMax != null && row.priceMax !== row.priceMin
                                ? ` – ${row.priceMax.toLocaleString('ru-RU')} ₽`
                                : ''}
                            </>
                          ) : (
                            'Цена не выставлена'
                          )}
                        </td>
                        <td className='py-3 px-3 border-t border-border whitespace-nowrap'>
                          {row.durationMinutes && row.durationMinutes > 0 ? `${row.durationMinutes} мин` : '—'}
                        </td>
                        <td className='py-3 px-3 border-t border-border text-muted'>{row.cityName || '—'}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {catalogPages > 1 && (
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <span className='text-sm text-muted'>
                Страница {catalogPage} из {catalogPages}
              </span>
              <div className='flex gap-2'>
                <button
                  className='btn secondary text-sm px-3 py-2'
                  disabled={catalogPage <= 1 || catalogLoading}
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                >
                  Назад
                </button>
                <button
                  className='btn secondary text-sm px-3 py-2'
                  disabled={catalogPage >= catalogPages || catalogLoading}
                  onClick={() => setCatalogPage((p) => p + 1)}
                >
                  Вперёд
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className='card overflow-hidden'>
          {loading ? (
            <div className='card-inner text-center py-10 text-muted'>Загрузка...</div>
          ) : filteredServices.length === 0 ? (
            <div className='card-inner text-center py-10 text-muted'>Услуг пока нет</div>
          ) : (
            <div className='overflow-auto'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Категория</th>
                    <th>Цена</th>
                    <th>Длительность</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map(service => (
                    <tr key={service.id}>
                      <td className='font-medium'>{service.name}</td>
                      <td className='text-muted'>{service.categoryName || '—'}</td>
                      <td>{service.price.toLocaleString('ru-RU')} ₽</td>
                      <td>{service.duration ? `${service.duration} мин` : '—'}</td>
                      <td>
                        <span className={`text-xs px-2 py-1 rounded ${service.isActive ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                          {service.isActive ? 'Активна' : 'Неактивна'}
                        </span>
                      </td>
                      <td className='text-right'>
                        <div className='flex gap-2 justify-end'>
                          <button onClick={() => openEditService(service)} className='btn secondary text-xs px-2 py-1'>
                            Редактировать
                          </button>
                          <button onClick={() => deleteService(service.id)} className='btn secondary text-xs px-2 py-1 text-danger'>
                            Удалить
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
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className='card overflow-hidden'>
          {filteredCategories.length === 0 ? (
            <div className='card-inner text-center py-10 text-muted'>Категорий пока нет</div>
          ) : (
            <div className='overflow-auto'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Описание</th>
                    <th>Услуг</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map(category => {
                    const servicesCount = services.filter(s => s.categoryId === category.id).length
                    return (
                      <tr key={category.id}>
                        <td className='font-medium'>{category.name}</td>
                        <td className='text-muted'>{category.description || '—'}</td>
                        <td>{servicesCount}</td>
                        <td className='text-right'>
                          <div className='flex gap-2 justify-end'>
                            <button onClick={() => openEditCategory(category)} className='btn secondary text-xs px-2 py-1'>
                              Редактировать
                            </button>
                            <button onClick={() => deleteCategory(category.id)} className='btn secondary text-xs px-2 py-1 text-danger'>
                              Удалить
                            </button>
                          </div>
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

      {/* Add/Edit Service Modal */}
      {openAddService && (
        <Modal title={editService ? 'Редактировать услугу' : 'Добавить услугу'} onClose={() => { setOpenAddService(false); setEditService(null); resetServiceForm() }}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input type='text' className='input' value={sName} onChange={e => setSName(e.target.value)} placeholder='Например: Замена экрана' />
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' value={sDescription} onChange={e => setSDescription(e.target.value)} placeholder='Описание услуги...' rows={3} />
            </div>
            <div>
              <label className='label'>Категория</label>
              <Select className='select' value={sCategoryId} onChange={e => setSCategoryId(e.target.value)}>
                <option value=''>Без категории</option>
                {categories.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='label'>Цена, ₽ *</label>
                <input type='number' className='input' value={sPrice} onChange={e => setSPrice(e.target.value)} placeholder='0' min='0' step='0.01' />
              </div>
              <div>
                <label className='label'>Длительность, мин</label>
                <input type='number' className='input' value={sDuration} onChange={e => setSDuration(e.target.value)} placeholder='0' min='0' />
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <input type='checkbox' checked={sIsActive} onChange={e => setSIsActive(e.target.checked)} className='w-4 h-4' />
              <label className='text-sm'>Активна</label>
            </div>
            <div className='flex justify-end gap-2 pt-4 border-t border-border'>
              <button onClick={() => { setOpenAddService(false); setEditService(null); resetServiceForm() }} className='btn secondary'>
                Отмена
              </button>
              <button onClick={saveService} className='btn'>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Category Modal */}
      {openAddCategory && (
        <Modal title={editCategory ? 'Редактировать категорию' : 'Создать категорию'} onClose={() => { setOpenAddCategory(false); setEditCategory(null); resetCategoryForm() }}>
          <div className='space-y-4'>
            <div>
              <label className='label'>Название *</label>
              <input type='text' className='input' value={cName} onChange={e => setCName(e.target.value)} placeholder='Поклейка защитного стекла' />
            </div>
            <div>
              <label className='label'>Описание</label>
              <textarea className='textarea' value={cDescription} onChange={e => setCDescription(e.target.value)} placeholder='Описание категории...' rows={3} />
            </div>
            <div className='flex justify-end gap-2 pt-4 border-t border-border'>
              <button onClick={() => { setOpenAddCategory(false); setEditCategory(null); resetCategoryForm() }} className='btn secondary'>
                Отмена
              </button>
              <button onClick={saveCategory} className='btn'>
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
