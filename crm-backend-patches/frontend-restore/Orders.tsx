import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch, isImageAttachment, staticUrl } from '../api'
import { printRepairReceipt, renderRepairReceiptHtml } from '../repairReceiptTemplate'
import Select from '../components/Select'
import DeviceCatalogFields from '../components/DeviceCatalogFields'
import OrderPricingFields from '../components/OrderPricingFields'
import { useDeviceCatalog } from '../hooks/useDeviceCatalog'
import { fetchCatalogPrice } from '../utils/catalogPrice'
import { sortModelsByRelease } from '../utils/modelSort'
import {
  CLOSED_SUCCESS_STATUS,
  CLOSED_SUCCESS_STATUSES,
  CANCELLED_STATUSES,
  ORDER_STATUSES,
  getOrderStatusColor,
  isClosedSuccessStatus,
} from '../utils/orderStatuses'
import { notifyBalanceChanged } from '../utils/balanceEvents'
import { useOrderStatuses } from '../hooks/useCompanySettings'
import OrderPartsSection from '../components/OrderPartsSection'
import OrderNotifyButtons from '../components/OrderNotifyButtons'
import type { OrderPartLine } from '../utils/notifyClient'

type Order = {
  id?: number;
  client: string;
  phone: string;
  clientAddress?: string;
  problem: string; // legacy - для обратной совместимости
  problems?: Array<{
    id?: number;
    problemId?: number | null;
    problemName: string;
    problemDescription?: string;
    price: number;
    costPrice?: number;
  }>;
  brand: string;
  model: string;
  color?: string;
  deviceStorage?: string;
  deviceType?: string;
  imei?: string;
  serialNumber?: string;
  equipment?: string;
  devicePassword?: string;
  prepayment?: number;
  managerName?: string;
  executorName?: string;
  dueAt?: string | null;
  isUrgent?: boolean;
  estimatedPrice?: number;
  receiverNotes?: string;
  inspection?: any;
  wishes?: any;
  status: string;
  price: number;
  costPrice?: number;
  description?: string;
  warranty?: boolean;
  warrantyDays?: number;
  warrantyEndsAt?: string | null;
  partsWrittenOff?: boolean;
  parts?: OrderPartLine[];
  onSite?: boolean;
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

type Brand = {
  id: number;
  name: string;
  icon: string;
}

type DeviceModel = {
  id: number;
  brandId: number;
  name: string;
  deviceType: string;
  brandName?: string;
}

type Problem = {
  id: number;
  name: string;
  description: string;
  defaultCostPrice: number;
  defaultPrice: number;
  deviceType: string;
}

type Client = {
  id: number;
  name: string;
  phone: string;
  email: string;
  totalOrders: number;
  totalSpent: number;
  notes?: string;
  telegram?: string;
  whatsapp?: string;
  lastOrderDate?: string;
  createdAt?: string;
  updatedAt?: string;
};



export default function Orders(){
  const { statuses: orderStatuses } = useOrderStatuses()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [rows, setRows] = useState<Order[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [stats, setStats] = useState<any>(null)
  const [closingOrder, setClosingOrder] = useState<Order | null>(null)
  const [showColumns, setShowColumns] = useState(false)
  
  // Данные для справочников
  const [brands, setBrands] = useState<Brand[]>([])
  const [models, setModels] = useState<DeviceModel[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<number | ''>('')

  // Клиенты
  const [clients, setClients] = useState<Client[]>([]);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());

  // Загрузка данных
  useEffect(() => {
    loadOrders();
    loadStats();
    loadBrands();
    loadProblems();
  }, [])

  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    const id = Number(openId)
    if (!Number.isFinite(id) || id <= 0) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(`/orders/${id}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) {
          setEditingOrder(data)
          setSearchParams({}, { replace: true })
        }
      } catch (e) {
        console.error('Ошибка открытия заказа:', e)
      }
    })()

    return () => { cancelled = true }
  }, [searchParams, setSearchParams])

  // Загрузка моделей при выборе бренда
  useEffect(() => {
    if (selectedBrandId) {
      loadModels(selectedBrandId);
    } else {
      setModels([]);
    }
  }, [selectedBrandId])

  // Поиск клиентов при изменении поискового запроса
  useEffect(() => {
    if (clientSearch && clientSearch.length >= 2) {
      const timer = setTimeout(() => {
        searchClients(clientSearch);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [clientSearch]);

  async function loadOrders() {
    try {
      setLoading(true);
      let url = `/orders`;
      const params = new URLSearchParams();
      
      if (search) params.append('client', search);
      if (selectedStatus) params.append('status', selectedStatus);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await apiFetch(url);
      const data = await response.json();
      setRows(data.orders || []);
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await apiFetch('/orders/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        calculateStatsFromOrders();
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
      calculateStatsFromOrders();
    }
  }

function calculateStatsFromOrders() {
  const stats = {
    totalOrders: rows.length,
    inProgress: rows.filter(o => o.status === 'В работе').length,
    ready: rows.filter(o => o.status === 'Готов').length,
    closed: rows.filter(o => isClosedSuccessStatus(o.status)).length,
    cancelled: rows.filter(o => (CANCELLED_STATUSES as readonly string[]).includes(o.status)).length,
    newOrders: rows.filter(o => o.status === 'Новый' || o.status === 'Создана' || o.status === 'Принята').length,
    waitingParts: rows.filter(o => o.status === 'Ждет запчасти').length,
    revenue: rows.reduce((sum, order) => sum + (order.price || 0), 0),
    cost: rows.reduce((sum, order) => sum + (order.costPrice || 0), 0)
  };
    
  const result = {
    ...stats,
    profit: stats.revenue - stats.cost
  };
  
  setStats(result);
}

  async function loadBrands() {
    try {
      const response = await apiFetch('/brands');
      const data = await response.json();
      setBrands(data);
    } catch (error) {
      console.error('Ошибка загрузки брендов:', error);
    }
  }

  async function loadModels(brandId: number) {
    try {
      const response = await apiFetch(`/brands/models?brandId=${brandId}`);
      
      if (!response.ok) {
        console.error(`Ошибка ${response.status}: ${response.statusText}`);
        setModels([]);
        return;
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setModels(sortModelsByRelease(data));
      } else {
        console.error('Ожидался массив моделей, получено:', data);
        setModels([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки моделей:', error);
      setModels([]);
    }
  }

  async function loadProblems() {
    try {
      const response = await apiFetch('/problems');
      const data = await response.json();
      setProblems(data);
    } catch (error) {
      console.error('Ошибка загрузки поломок:', error);
    }
  }

  async function searchClients(query: string) {
    try {
      setClientLoading(true);
      const response = await apiFetch(`/clients/search/by-phone?phone=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const data = await response.json();
        setClients(Array.isArray(data) ? data : []);
      } else {
        setClients([]);
      }
    } catch (error) {
      console.error('Ошибка поиска клиентов:', error);
      setClients([]);
    } finally {
      setClientLoading(false);
    }
  }

  async function updateOrderStatus(id: number, status: string) {
    try {
      // Если статус меняется на "Закрыт", открываем модальное окно
      if (status === CLOSED_SUCCESS_STATUS) {
        const order = rows.find(o => o.id === id);
        if (order) {
          setClosingOrder(order);
          return; // Не обновляем статус сразу, ждём подтверждения оплаты
        }
      }
      
      const response = await apiFetch(`/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        setRows(prev => prev.map(order => 
          order.id === id ? { ...order, status } : order
        ));
        loadStats();
      } else {
        const error = await response.json();
        alert(error.error || 'Ошибка обновления статуса');
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      alert('Ошибка сети при обновлении статуса');
    }
  }

  async function updateOrder(order: Order) {
    try {
      const response = await apiFetch(`/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setRows(prev => prev.map(o => 
          o.id === order.id ? updatedOrder : o
        ));
        loadStats();
        return updatedOrder;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка обновления заказа');
      }
    } catch (error) {
      console.error('Ошибка обновления заказа:', error);
      throw error;
    }
  }

  async function printRepairInvoice(orderId: number) {
    try {
      const resp = await apiFetch(`/invoices/repair/${orderId}`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || `Ошибка ${resp.status}`)
      }
      const data = await resp.json()
      const raw = data.order || {}
      const order = {
        ...raw,
        inspection:
          typeof raw.inspection === 'string' ? JSON.parse(raw.inspection || '{}') : raw.inspection || {},
        wishes: typeof raw.wishes === 'string' ? JSON.parse(raw.wishes || '{}') : raw.wishes || {},
        problems: raw.problems || [],
      }

      const html = renderRepairReceiptHtml({
        company: {
          name: data.company?.name,
          legalName: data.company?.name,
          postalAddress: data.company?.address,
          phone: data.company?.phone,
          email: data.company?.email,
          inn: data.company?.inn,
        },
        order,
        documentDate: data.invoiceDate,
      })
      const ok = printRepairReceipt(html)
      if (!ok) {
        alert('Разрешите всплывающие окна для печати')
      }
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Не удалось открыть квитанцию')
    }
  }

  async function closeOrderWithPayment(order: Order, amount: number, paymentMethod: string, comment?: string, costPrice = 0) {
    try {
      const cost = Math.max(0, Number(costPrice) || 0)
      const paymentDescription = comment || `Оплата заказа #${order.id}`

      const paymentResponse = await apiFetch('/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          type: 'Приход',
          description: paymentDescription,
          categoryId: null,
          method: paymentMethod,
          orderId: order.id,
          saleCategory: 'repair',
        })
      });

      if (!paymentResponse.ok) {
        const error = await paymentResponse.json();
        throw new Error(error.error || 'Ошибка создания платежа');
      }

      if (cost > 0) {
        const costResponse = await apiFetch('/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: cost,
            type: 'Расход',
            description: `Себестоимость: ${paymentDescription}`,
            orderId: order.id,
          })
        })
        if (!costResponse.ok) {
          const error = await costResponse.json();
          throw new Error(error.error || 'Ошибка создания расхода по себестоимости');
        }
      }

      const orderResponse = await apiFetch(`/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: CLOSED_SUCCESS_STATUS,
          price: amount,
          costPrice: cost,
        })
      });

      if (!orderResponse.ok) {
        const error = await orderResponse.json();
        throw new Error(error.error || 'Ошибка обновления заказа');
      }

      setRows(prev => prev.map(o => 
        o.id === order.id ? { ...o, status: CLOSED_SUCCESS_STATUS, price: amount, costPrice: cost } : o
      ));
      
      setClosingOrder(null);
      loadStats();
      notifyBalanceChanged();
      
      const profit = amount - cost
      alert(`Заказ #${order.id} закрыт. Оплата ${amount.toLocaleString('ru-RU')} ₽, прибыль ${profit.toLocaleString('ru-RU')} ₽`);
      
    } catch (error: any) {
      console.error('Ошибка закрытия заказа:', error);
      alert(error.message || 'Ошибка при закрытии заказа');
    }
  }

  async function deleteOrder(id: number) {
    if (!confirm('Удалить заказ?')) return;
    
    try {
      const response = await apiFetch(`/orders/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setRows(prev => prev.filter(order => order.id !== id));
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        loadStats();
        notifyBalanceChanged();
      }
    } catch (error) {
      console.error('Ошибка удаления заказа:', error);
      alert('Ошибка удаления заказа');
    }
  }

  function toggleOrderSelection(id: number, checked: boolean) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allVisibleSelected =
    rows.length > 0 && rows.every((order) => order.id != null && selectedOrderIds.has(order.id));

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedOrderIds(new Set());
      return;
    }
    setSelectedOrderIds(new Set(rows.map((order) => order.id!).filter(Boolean)));
  }

  async function deleteSelectedOrders() {
    const ids = Array.from(selectedOrderIds);
    if (!ids.length) return;
    if (!confirm(`Удалить выбранные заказы (${ids.length})?`)) return;

    try {
      const results = await Promise.all(
        ids.map((id) => apiFetch(`/orders/${id}`, { method: 'DELETE' }))
      );
      const failed = results.filter((response) => !response.ok).length;
      if (failed > 0) {
        alert(`Не удалось удалить заказов: ${failed}`);
      }
      setSelectedOrderIds(new Set());
      loadOrders();
      loadStats();
      notifyBalanceChanged();
    } catch (error) {
      console.error('Ошибка массового удаления:', error);
      alert('Ошибка удаления заказов');
    }
  }

  const handleSearch = () => {
    loadOrders();
  };

  const filterByStatus = (status: string) => {
    setSelectedStatus(status === selectedStatus ? '' : status);
  };

  useEffect(() => {
    loadOrders();
  }, [selectedStatus]);

  const formatPhone = (phone: string): string => {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      cleaned = '7' + cleaned;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('7')) {
      return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
    }
    
    return phone;
  };

  const handlePhoneInput = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, '');
    
    if ((cleaned.startsWith('8') || cleaned.startsWith('9')) && cleaned.length <= 11) {
      cleaned = '7' + (cleaned.startsWith('8') ? cleaned.substring(1) : cleaned);
    }
    
    cleaned = cleaned.substring(0, 11);
    
    let formatted = '';
    if (cleaned.length > 0) {
      formatted = '+7';
      if (cleaned.length > 1) {
        formatted += ` (${cleaned.substring(1, Math.min(4, cleaned.length))}`;
      }
      if (cleaned.length > 4) {
        formatted += `) ${cleaned.substring(4, Math.min(7, cleaned.length))}`;
      }
      if (cleaned.length > 7) {
        formatted += `-${cleaned.substring(7, Math.min(9, cleaned.length))}`;
      }
      if (cleaned.length > 9) {
        formatted += `-${cleaned.substring(9, Math.min(11, cleaned.length))}`;
      }
    }
    
    return formatted;
  };

  const statuses = orderStatuses.length ? orderStatuses : [...ORDER_STATUSES];
  
  const deviceTypes = ['Смартфон', 'Планшет', 'Ноутбук', 'ПК', 'Другое'];

  const getStatusColor = getOrderStatusColor;

  type ColumnKey =
    | 'id'
    | 'status'
    | 'client'
    | 'phone'
    | 'problem'
    | 'device'
    | 'costPrice'
    | 'price'
    | 'profit'
    | 'createdAt'
    | 'actions'

  type ColumnConfig = { key: ColumnKey; label: string; visible: boolean }

  const COLUMNS_LS_KEY = 'fixnet.orders.columns.v1'

  const defaultColumns: ColumnConfig[] = useMemo(
    () => [
      { key: 'id', label: 'Заказ', visible: true },
      { key: 'status', label: 'Статус', visible: true },
      { key: 'client', label: 'Клиент', visible: true },
      { key: 'phone', label: 'Телефон', visible: true },
      { key: 'problem', label: 'Проблема', visible: true },
      { key: 'device', label: 'Устройство', visible: true },
      { key: 'costPrice', label: 'Себестоимость', visible: true },
      { key: 'price', label: 'Стоимость', visible: true },
      { key: 'profit', label: 'Прибыль', visible: true },
      { key: 'createdAt', label: 'Создан', visible: true },
      { key: 'actions', label: 'Действия', visible: true }
    ],
    []
  )

  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_LS_KEY)
      if (!raw) return defaultColumns
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return defaultColumns

      const byKey = new Map(defaultColumns.map((c) => [c.key, c]))
      const restored: ColumnConfig[] = []
      for (const item of parsed) {
        const k = item?.key as ColumnKey
        const base = byKey.get(k)
        if (!base) continue
        restored.push({
          ...base,
          visible: typeof item?.visible === 'boolean' ? item.visible : base.visible
        })
        byKey.delete(k)
      }
      for (const c of defaultColumns) {
        if (byKey.has(c.key)) restored.push(c)
      }
      return restored.map((c) => (c.key === 'actions' ? { ...c, visible: true } : c))
    } catch {
      return defaultColumns
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_LS_KEY, JSON.stringify(columns))
    } catch {
      // ignore
    }
  }, [columns])

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns])

  const columnWidths: Partial<Record<ColumnKey, string>> = {
    id: 'w-[5%]',
    status: 'w-[10%]',
    client: 'w-[11%]',
    phone: 'w-[10%]',
    problem: 'w-[24%]',
    device: 'w-[12%]',
    costPrice: 'w-[8%]',
    price: 'w-[8%]',
    profit: 'w-[8%]',
    createdAt: 'w-[8%]',
    actions: 'w-[16%]'
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div className='flex-1'>
          <h1 className='text-xl sm:text-2xl font-bold'>Заказы</h1>
          {stats && (
            <div className='flex flex-wrap gap-2 sm:gap-4 mt-2 text-xs sm:text-sm'>
              <span className='text-muted'>Всего: <strong>{stats.totalOrders}</strong></span>
              <span className='text-muted'>Новые: <strong>{stats.newOrders || 0}</strong></span>
              <span className='text-muted'>Ждут запчасти: <strong>{stats.waitingParts || 0}</strong></span>
              <span className='text-muted'>В работе: <strong>{stats.inProgress}</strong></span>
              <span className='text-muted'>Готово: <strong>{stats.ready}</strong></span>
              <span className='text-primary'>Выручка: <strong>{stats.revenue?.toLocaleString('ru-RU')} ₽</strong></span>
              <span className='text-success'>Прибыль: <strong>{stats.profit?.toLocaleString('ru-RU')} ₽</strong></span>
            </div>
          )}
        </div>
        <div className='flex gap-2 flex-shrink-0'>
          <button className='btn secondary text-sm px-3 py-2 hidden sm:inline-flex' onClick={() => {}}>
            Поломки
          </button>
          <button
            className='btn secondary text-sm px-3 py-2 hidden sm:inline-flex'
            onClick={() => setShowColumns(true)}
            title='Настроить колонки'
          >
            Колонки
          </button>
          <button className='btn text-sm px-4 py-2 flex-1 sm:flex-initial' onClick={() => setOpen(true)}>
            Создать заявку
          </button>
        </div>
      </div>

      <div className='card p-3 sm:p-4'>
        <div className='flex flex-col md:flex-row gap-3 sm:gap-4'>
          <div className='flex-1 w-full'>
            <div className='flex items-center gap-1.5 sm:gap-2 mb-2 overflow-x-auto pb-2 -mx-1 px-1'>
              <button className={`tag whitespace-nowrap ${selectedStatus === '' ? 'tag-active' : ''}`} onClick={() => setSelectedStatus('')}>
                Все
              </button>
              {statuses.map(status => (
                <button key={status} className={`tag whitespace-nowrap ${selectedStatus === status ? 'tag-active' : ''}`} onClick={() => filterByStatus(status)}>
                  {status}
                </button>
              ))}
            </div>
            <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
              <input 
                placeholder='Поиск по клиенту или телефону...' 
                className='input flex-1 text-base sm:text-sm' 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <div className='flex gap-2'>
                <button className='btn secondary text-sm px-3 py-2 flex-1 sm:flex-initial' onClick={handleSearch}>Найти</button>
                <button className='btn ghost text-sm px-3 py-2' onClick={() => { setSearch(''); setSelectedStatus(''); loadOrders(); }}>Сбросить</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='card overflow-hidden md:hidden'>
        {loading ? (
          <div className='py-12 text-center text-muted'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
            <p className='mt-2'>Загрузка заказов...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className='py-12 text-center text-muted'>
            <p className='text-lg font-medium'>Заказов пока нет</p>
            <p className='text-sm mt-1'>Создайте первый заказ</p>
          </div>
        ) : (
          <div className='p-3 space-y-3'>
            {rows.map((order) => {
              const profit = (order.price || 0) - (order.costPrice || 0)
              return (
                <article
                  key={order.id}
                  className='list-card active:bg-surface cursor-pointer'
                  onClick={() => setEditingOrder(order)}
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='font-semibold'>#{order.id}</div>
                      <div className='text-sm truncate'>{order.client || '—'}</div>
                      {order.phone ? (
                        <a
                          href={`tel:${order.phone}`}
                          className='text-xs text-primary'
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatPhone(order.phone)}
                        </a>
                      ) : (
                        <div className='text-xs text-muted'>нет телефона</div>
                      )}
                    </div>
                    <div className='text-right shrink-0'>
                      <div className='text-sm font-semibold'>
                        {(order.price || 0).toLocaleString('ru-RU')} ₽
                      </div>
                      <div className={`text-xs ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                        {profit.toLocaleString('ru-RU')} ₽
                      </div>
                      <div className='text-[11px] text-muted mt-1'>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString('ru-RU') : '—'}
                      </div>
                    </div>
                  </div>
                  <div className='text-sm text-white/80 line-clamp-2'>{order.problem || '—'}</div>
                  <div className='text-xs text-muted'>
                    {[order.brand, order.model, order.deviceType].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                    <div className='flex-1 min-w-0'>
                      <Select
                        buttonClassName={`text-xs px-2 py-2 rounded-lg w-full ${getStatusColor(order.status)}`}
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id!, e.target.value)}
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <input
                      type='checkbox'
                      className='rounded border-border cursor-pointer w-5 h-5'
                      checked={order.id != null && selectedOrderIds.has(order.id)}
                      onChange={(e) => toggleOrderSelection(order.id!, e.target.checked)}
                      aria-label={`Выбрать заказ #${order.id}`}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <div className='card overflow-hidden hidden md:block'>
        {loading ? (
          <div className='py-12 text-center text-muted'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
            <p className='mt-2'>Загрузка заказов...</p>
          </div>
        ) : (
          <div className='overflow-auto'>
            <table className='w-full table-fixed text-sm'>
              <thead>
                <tr>
                  {visibleColumns.map((c) => (
                    <th
                      key={c.key}
                      className={`text-left font-semibold text-muted py-3 px-3 ${columnWidths[c.key] || ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className='text-center font-semibold text-muted py-3 px-3 w-[10%] whitespace-nowrap'>
                    <div className='flex items-center justify-center gap-2'>
                      <input
                        type='checkbox'
                        className='rounded border-border cursor-pointer'
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label='Выбрать все заказы на странице'
                        title='Выбрать все'
                      />
                      <button
                        type='button'
                        className={`text-sm px-2.5 py-1.5 rounded border transition whitespace-nowrap ${
                          selectedOrderIds.size > 0
                            ? 'border-danger text-danger hover:bg-danger/10 cursor-pointer'
                            : 'border-border text-muted opacity-50 cursor-not-allowed'
                        }`}
                        onClick={deleteSelectedOrders}
                        disabled={selectedOrderIds.size === 0}
                        title={
                          selectedOrderIds.size > 0
                            ? `Удалить выбранные (${selectedOrderIds.size})`
                            : 'Сначала отметьте заказы'
                        }
                      >
                        Удалить{selectedOrderIds.size > 0 ? ` (${selectedOrderIds.size})` : ''}
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className='py-12 text-center text-muted'>
                      <p className='text-lg font-medium'>Заказов пока нет</p>
                      <p className='text-sm mt-1'>Создайте первый заказ</p>
                    </td>
                  </tr>
                ) : (
                  rows.map(order => {
                    const profit = (order.price || 0) - (order.costPrice || 0);
                    return (
                      <tr
                        key={order.id}
                        className='hover:bg-surface transition-colors cursor-pointer'
                        onClick={() => setEditingOrder(order)}
                        title='Открыть заказ'
                      >
                        {visibleColumns.map((c) => {
                          switch (c.key) {
                            case 'id':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border font-medium whitespace-nowrap'>
                                  #{order.id}
                                </td>
                              )
                            case 'status':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border' onClick={(e) => e.stopPropagation()}>
                                  <Select
                                    buttonClassName={`text-xs px-2 py-1 rounded-lg min-h-0 ${getStatusColor(order.status)}`}
                                    value={order.status}
                                    onChange={(e) => updateOrderStatus(order.id!, e.target.value)}
                                  >
                                    {statuses.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                              )
                            case 'client':
                              return <td key={c.key} className='py-3 px-3 border-t border-border'>{order.client}</td>
                            case 'phone':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border text-muted whitespace-nowrap'>
                                  {formatPhone(order.phone)}
                                </td>
                              )
                            case 'problem':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border align-top'>
                                  <div className='text-sm whitespace-normal break-words'>{order.problem}</div>
                                </td>
                              )
                            case 'device':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border'>
                                  <div className='text-sm'>
                                    <div>
                                      {order.brand} {order.model}
                                    </div>
                                    <div className='text-muted text-xs'>{order.deviceType}</div>
                                  </div>
                                </td>
                              )
                            case 'costPrice':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border text-muted text-sm whitespace-nowrap'>
                                  {(order.costPrice || 0).toLocaleString('ru-RU')} ₽
                                </td>
                              )
                            case 'price':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border font-semibold whitespace-nowrap'>
                                  {(order.price || 0).toLocaleString('ru-RU')} ₽
                                </td>
                              )
                            case 'profit':
                              return (
                                <td
                                  key={c.key}
                                  className={`py-3 px-3 border-t border-border font-semibold whitespace-nowrap ${profit >= 0 ? 'text-success' : 'text-danger'}`}
                                >
                                  {profit.toLocaleString('ru-RU')} ₽
                                </td>
                              )
                            case 'createdAt':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border text-muted text-sm whitespace-nowrap'>
                                  {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                                </td>
                              )
                            case 'actions':
                              return (
                                <td key={c.key} className='py-3 px-3 border-t border-border' onClick={(e) => e.stopPropagation()}>
                                  <div className='flex flex-wrap gap-2'>
                                    <button
                                      className='text-sm px-3 py-1.5 rounded bg-bg border border-border hover:bg-surface transition whitespace-nowrap'
                                      onClick={() => setEditingOrder(order)}
                                    >
                                      Редактировать
                                    </button>
                                    <button
                                      className='text-sm px-3 py-1.5 rounded bg-bg border border-primary text-primary hover:bg-surface transition whitespace-nowrap'
                                      onClick={() => printRepairInvoice(order.id!)}
                                      title='Печать квитанции'
                                    >
                                      Печать
                                    </button>
                                    <button
                                      className='text-sm px-3 py-1.5 rounded bg-bg text-danger border border-danger hover:bg-surface transition whitespace-nowrap'
                                      onClick={() => deleteOrder(order.id!)}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </td>
                              )
                            default:
                              return null
                          }
                        })}
                        <td
                          className='py-3 px-3 border-t border-border text-center'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type='checkbox'
                            className='rounded border-border cursor-pointer'
                            checked={order.id != null && selectedOrderIds.has(order.id)}
                            onChange={(e) => toggleOrderSelection(order.id!, e.target.checked)}
                            aria-label={`Выбрать заказ #${order.id}`}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showColumns && (
        <div className='fixed inset-0 z-50'>
          <div className='absolute inset-0 bg-black/50' onClick={() => setShowColumns(false)} />
          <div className='absolute top-20 left-1/2 -translate-x-1/2 w-[min(680px,calc(100vw-24px))] card p-4 shadow-soft'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='font-semibold'>Колонки списка заказов</div>
                <div className='text-xs text-muted mt-0.5'>Скрывайте лишнее и меняйте порядок (сохранится в этом браузере)</div>
              </div>
              <button className='btn secondary text-sm px-3 py-2' onClick={() => setShowColumns(false)}>
                Закрыть
              </button>
            </div>

            <div className='mt-4 space-y-2 max-h-[60vh] overflow-auto pr-1'>
              {columns.map((c, idx) => (
                <div key={c.key} className='flex items-center gap-3 p-2 rounded-xl border border-border bg-bg'>
                  <input
                    type='checkbox'
                    checked={c.key === 'actions' ? true : c.visible}
                    disabled={c.key === 'actions'}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setColumns((prev) =>
                        prev.map((x) => (x.key === c.key ? { ...x, visible: c.key === 'actions' ? true : checked } : x))
                      )
                    }}
                  />
                  <div className='flex-1'>
                    <div className='text-sm font-medium'>{c.label}</div>
                    <div className='text-xs text-muted'>{c.key}</div>
                  </div>
                  <div className='flex gap-2'>
                    <button
                      className='btn secondary text-xs px-2 py-1'
                      disabled={idx === 0}
                      onClick={() => {
                        setColumns((prev) => {
                          const next = [...prev]
                          const a = next[idx - 1]
                          next[idx - 1] = next[idx]
                          next[idx] = a
                          return next
                        })
                      }}
                      title='Вверх'
                    >
                      ↑
                    </button>
                    <button
                      className='btn secondary text-xs px-2 py-1'
                      disabled={idx === columns.length - 1}
                      onClick={() => {
                        setColumns((prev) => {
                          const next = [...prev]
                          const a = next[idx + 1]
                          next[idx + 1] = next[idx]
                          next[idx] = a
                          return next
                        })
                      }}
                      title='Вниз'
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className='mt-4 flex gap-2 justify-end'>
              <button className='btn secondary text-sm px-3 py-2' onClick={() => setColumns(defaultColumns)} title='Вернуть стандартные колонки'>
                Сбросить
              </button>
              <button className='btn text-sm px-4 py-2' onClick={() => setShowColumns(false)}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания заказа */}
      {open && (
        <OrderModal 
          onClose={() => setOpen(false)} 
          onSave={(newOrder) => { 
            setRows([newOrder, ...rows]); 
            loadStats(); 
            setOpen(false); 
          }}
          onPrint={(orderId) => printRepairInvoice(orderId)}
          brands={brands}
          models={models}
          problems={problems}
          onBrandsUpdate={loadBrands}
          onModelsUpdate={() => selectedBrandId && loadModels(selectedBrandId)}
          onProblemsUpdate={loadProblems}
          formatPhone={handlePhoneInput}
          selectedBrandId={selectedBrandId}
          setSelectedBrandId={setSelectedBrandId}
        />
      )}

      {/* Модальное окно редактирования заказа */}
      {editingOrder && (
        <EditOrderModal 
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSave={async (updatedOrder) => {
            try {
              const result = await updateOrder(updatedOrder);
              setEditingOrder(null);
              loadOrders(); // Перезагружаем список заказов с сервера
              alert('Заказ успешно обновлен');
            } catch (error: any) {
              alert(error.message || 'Ошибка обновления заказа');
            }
          }}
          brands={brands}
          problems={problems}
          formatPhone={handlePhoneInput}
        />
      )}

      {/* Модальное окно закрытия заказа с оплатой */}
      {closingOrder && (
        <CloseOrderModal 
          order={closingOrder}
          onClose={() => setClosingOrder(null)}
          onConfirm={closeOrderWithPayment}
        />
      )}
    </div>
  );
}

// Компонент модального окна редактирования заказа
function EditOrderModal({ 
  order, 
  onClose, 
  onSave,
  brands,
  problems,
  formatPhone
}: { 
  order: Order; 
  onClose: () => void; 
  onSave: (order: Order) => void;
  brands: Brand[];
  problems: Problem[];
  formatPhone: (phone: string) => string;
}) {
  type HistoryItem = {
    id: number
    type: 'status' | 'comment' | 'file' | 'system'
    message: string
    attachments?: Array<{ name: string; size?: number; mime?: string; url: string }>
    createdAt: string
    createdBy?: { id: number; name: string } | null
  }

  const { statuses: dynamicStatuses, settings } = useOrderStatuses()

  const [form, setForm] = useState<Order>({
    ...order,
    description: order.description || order.problems?.[0]?.problemDescription || '',
    price: order.price || 0,
    costPrice: order.costPrice || 0,
    warranty: order.warranty || false,
    warrantyDays: order.warrantyDays || 90,
    parts: order.parts || [],
    partsWrittenOff: order.partsWrittenOff || false,
    onSite: order.onSite || false,
    paymentMethod: order.paymentMethod || 'cash'
  });

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [historyComment, setHistoryComment] = useState('')
  const [historySaving, setHistorySaving] = useState(false)
  const [historyUploading, setHistoryUploading] = useState(false)
  const statuses = dynamicStatuses.length ? dynamicStatuses : [...ORDER_STATUSES];

  async function loadHistory() {
    if (!order?.id) return
    try {
      setHistoryLoading(true)
      const res = await apiFetch(`/orders/${order.id}/history`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setHistoryItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      console.error('Ошибка загрузки истории:', e)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  async function addHistoryComment() {
    const text = historyComment.trim()
    if (!text || !order?.id) return
    try {
      setHistorySaving(true)
      const res = await apiFetch(`/orders/${order.id}/history/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setHistoryComment('')
      await loadHistory()
    } catch (e: any) {
      alert(e?.message || 'Не удалось добавить комментарий')
    } finally {
      setHistorySaving(false)
    }
  }

  async function uploadHistoryFiles(files: FileList | null) {
    if (!files || files.length === 0 || !order?.id) return
    try {
      setHistoryUploading(true)
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('files', f))
      const res = await apiFetch(`/orders/${order.id}/history/files`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      await loadHistory()
    } catch (e: any) {
      alert(e?.message || 'Не удалось загрузить файлы')
    } finally {
      setHistoryUploading(false)
    }
  }

  const catalog = useDeviceCatalog()
  const crmIssueNames = useMemo(
    () => problems.filter((p) => !form.deviceType || p.deviceType === form.deviceType).map((p) => p.name),
    [problems, form.deviceType],
  )
  const issueOptions = catalog.issueNames(crmIssueNames)

  useEffect(() => {
    void catalog.refreshContext({
      deviceType: form.deviceType || '',
      brandName: form.brand,
      modelName: form.model,
      issueCode: catalog.findIssueCode(form.problem),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.deviceType, form.brand, form.model, form.problem])

  const applyCatalogPrice = async (issueName: string, subtypeName?: string) => {
    if (!form.brand?.trim() || !form.model?.trim() || !issueName.trim()) return
    const lookupName = subtypeName?.trim() || issueName.trim()
    const matchedProblem = problems.find((p) => p.name.toLowerCase() === issueName.trim().toLowerCase())
    const result = await fetchCatalogPrice({
      brand: form.brand,
      model: form.model,
      problemName: lookupName,
      problemId: matchedProblem?.id,
      partType: 'original',
    })
    if (result) {
      setForm((prev) => ({
        ...prev,
        price: result.priceMin,
        costPrice: result.costPrice,
        estimatedPrice: prev.estimatedPrice || result.priceMin,
      }))
    }
  }

  const handleIssueChange = (value: string) => {
    setForm((prev) => ({ ...prev, problem: value }))
    const inList = issueOptions.some((o) => o.toLowerCase() === value.trim().toLowerCase())
    if (inList && value.trim()) void applyCatalogPrice(value)
  }

  const handleIssueSubtypeChange = (value: string) => {
    setForm((prev) => ({ ...prev, description: value }))
    const inList = catalog.subtypeNames.some((o) => o.toLowerCase() === value.trim().toLowerCase())
    if (inList && value.trim() && form.problem?.trim()) void applyCatalogPrice(form.problem, value)
  }

  const paymentMethods = [
    { value: 'cash', label: 'Наличные' },
    { value: 'card', label: 'Карта' },
    { value: 'online', label: 'Онлайн' },
    { value: 'invoice', label: 'Счет' }
  ];

  const handleSubmit = async () => {
    if (!form.client || !form.phone || !form.problem) {
      alert('Заполните обязательные поля: клиент, телефон, проблема');
      return;
    }

    setLoading(true);
    try {
      await onSave(form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='modal-overlay'>
      <div className='modal-panel max-w-2xl'>
        <div className='card-inner'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6'>
            <div className='flex-1'>
              <h2 className='modal-title'>Редактирование заказа #{order.id}</h2>
              <p className='text-sm text-muted mt-1'>Обновление информации о заказе</p>
            </div>
            <button onClick={onClose} className='btn secondary self-start sm:self-auto'>Закрыть</button>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <label className='label'>Клиент *</label>
              <input className='input' value={form.client} onChange={(e) => setForm({...form, client: e.target.value})} placeholder='ФИО клиента'/>
            </div>

            <div>
              <label className='label'>Телефон *</label>
              <input className='input' value={form.phone} onChange={(e) => { const formatted = formatPhone(e.target.value); setForm({...form, phone: formatted}); }} placeholder='+7 (___) ___-__-__'/>
            </div>

            <div>
              <label className='label'>Статус</label>
              <Select className='select' value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
                {statuses.map(status => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>

            <div className='md:col-span-2 p-4 bg-surface rounded-xl border border-border'>
              <h3 className='font-semibold text-sm mb-3'>Устройство и неисправность</h3>
              <DeviceCatalogFields
                catalog={catalog}
                deviceType={form.deviceType || 'Смартфон'}
                brand={form.brand}
                model={form.model}
                issue={form.problem}
                issueSubtype={form.description || ''}
                issueOptions={issueOptions}
                onDeviceTypeChange={(deviceType) => setForm((prev) => ({ ...prev, deviceType }))}
                onBrandChange={(brand) => setForm((prev) => ({ ...prev, brand }))}
                onModelChange={(model) => setForm((prev) => ({ ...prev, model }))}
                onIssueChange={handleIssueChange}
                onIssueSubtypeChange={handleIssueSubtypeChange}
              />
            </div>

            <OrderPricingFields
              prepayment={form.prepayment || ''}
              estimatedPrice={form.estimatedPrice || ''}
              costPrice={form.costPrice || ''}
              price={form.price || ''}
              paymentMethod={form.paymentMethod || 'cash'}
              warranty={form.warranty || false}
              onSite={form.onSite || false}
              paymentMethods={paymentMethods}
              onPrepaymentChange={(value) => setForm((prev) => ({ ...prev, prepayment: Number(value) || 0 }))}
              onEstimatedPriceChange={(value) => setForm((prev) => ({ ...prev, estimatedPrice: Number(value) || 0 }))}
              onCostPriceChange={(value) => setForm((prev) => ({ ...prev, costPrice: Number(value) || 0 }))}
              onPriceChange={(value) => setForm((prev) => ({ ...prev, price: Number(value) || 0 }))}
              onPaymentMethodChange={(value) => setForm((prev) => ({ ...prev, paymentMethod: value }))}
              onWarrantyChange={(checked) => setForm((prev) => ({ ...prev, warranty: checked }))}
              onOnSiteChange={(checked) => setForm((prev) => ({ ...prev, onSite: checked }))}
            />

            {form.warranty && (
              <div className='md:col-span-2 flex items-center gap-2 flex-wrap'>
                <span className='text-sm text-muted'>Гарантия, дней</span>
                <input
                  type='number'
                  className='input w-24 py-1'
                  min={1}
                  value={form.warrantyDays || settings?.warrantyDaysDefault || 90}
                  onChange={(e) => setForm({ ...form, warrantyDays: Number(e.target.value) || 90 })}
                />
                {form.warrantyEndsAt && (
                  <span className='text-xs text-muted'>до {new Date(form.warrantyEndsAt).toLocaleDateString('ru-RU')}</span>
                )}
              </div>
            )}

            <OrderNotifyButtons
              client={form.client}
              phone={form.phone}
              orderId={order.id}
              brand={form.brand}
              model={form.model}
              status={form.status}
            />

            <OrderPartsSection
              parts={form.parts || []}
              partsWrittenOff={form.partsWrittenOff}
              onChange={(parts) => setForm((prev) => ({ ...prev, parts }))}
            />

            <div className='md:col-span-2'>
              <label className='label'>Заметки приемщика</label>
              <textarea className='textarea' value={form.receiverNotes || ''} onChange={(e) => setForm({ ...form, receiverNotes: e.target.value })} placeholder='Предварительная диагностика…' rows={2} />
            </div>

            <div className='md:col-span-2 text-xs text-muted'>
              <p>Создан: {new Date(order.createdAt).toLocaleString('ru-RU')}</p>
              {order.updatedAt && <p>Обновлен: {new Date(order.updatedAt).toLocaleString('ru-RU')}</p>}
            </div>
          </div>

          <div className='mt-6 pt-6 border-t border-border'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <div className='font-semibold'>История заказа</div>
                <div className='text-xs text-muted mt-0.5'>Комментарии, файлы и автоматические события (например смена статуса)</div>
              </div>
              <button className='btn secondary text-sm px-3 py-2' onClick={loadHistory} disabled={historyLoading}>
                Обновить
              </button>
            </div>

            <div className='mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4'>
              <div className='lg:col-span-2'>
                <div className='space-y-2 max-h-[360px] overflow-auto pr-1'>
                  {historyLoading ? (
                    <div className='text-sm text-muted py-6'>Загрузка...</div>
                  ) : historyItems.length === 0 ? (
                    <div className='text-sm text-muted py-6'>Пока пусто</div>
                  ) : (
                    historyItems.map((it) => (
                      <div key={it.id} className='p-3 rounded-xl border border-border bg-bg'>
                        <div className='flex items-center justify-between gap-3'>
                          <div className='text-xs text-muted'>
                            {new Date(it.createdAt).toLocaleString('ru-RU')}
                            {it.createdBy?.name ? ` • ${it.createdBy.name}` : ''}
                            {it.type ? ` • ${it.type}` : ''}
                          </div>
                        </div>
                        <div className='mt-1 text-sm whitespace-pre-wrap break-words'>{it.message}</div>
                        {Array.isArray(it.attachments) && it.attachments.length > 0 && (
                          <div className='mt-2 flex flex-wrap gap-2'>
                            {it.attachments.map((a) => {
                              const href = staticUrl(a.url)
                              const label = isImageAttachment(a)
                                ? (a.name ? `Фото: ${a.name}` : 'Открыть фото')
                                : (a.name || 'Файл')
                              return (
                                <a
                                  key={a.url}
                                  href={href}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='text-xs px-2 py-1 rounded bg-surface border border-border hover:bg-bg transition'
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {label}
                                </a>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className='space-y-3'>
                <div>
                  <label className='label'>Комментарий</label>
                  <textarea
                    className='textarea'
                    rows={4}
                    value={historyComment}
                    onChange={(e) => setHistoryComment(e.target.value)}
                    placeholder='Напишите комментарий...'
                  />
                  <div className='mt-2 flex gap-2'>
                    <button className='btn flex-1' onClick={addHistoryComment} disabled={historySaving || !historyComment.trim()}>
                      {historySaving ? 'Сохранение...' : 'Добавить'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className='label'>Файлы / фото</label>
                  <input
                    type='file'
                    multiple
                    className='input'
                    onChange={(e) => uploadHistoryFiles(e.target.files)}
                    disabled={historyUploading}
                  />
                  <div className='text-xs text-muted mt-1'>До 10 файлов за раз, до 15MB каждый</div>
                </div>
              </div>
            </div>
          </div>

          <div className='flex flex-col sm:flex-row justify-end gap-3 mt-6 sm:mt-8 pt-6 border-t border-border'>
            <button className='btn secondary order-2 sm:order-1' onClick={onClose} disabled={loading}>
              Отмена
            </button>
            <button 
              className='btn order-1 sm:order-2 flex-1 sm:flex-initial' 
              onClick={handleSubmit}
              disabled={loading || !form.client || !form.phone || !form.problem}
            >
              {loading ? (
                <>
                  <div className='inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2'></div>
                  Сохранение...
                </>
              ) : 'Сохранить изменения'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Компонент модального окна закрытия заказа с оплатой
function CloseOrderModal({ 
  order, 
  onClose, 
  onConfirm 
}: { 
  order: Order; 
  onClose: () => void; 
  onConfirm: (order: Order, amount: number, paymentMethod: string, comment?: string, costPrice?: number) => void;
}) {
  const [amount, setAmount] = useState<number>(order.price || 0);
  const [costPrice, setCostPrice] = useState<number>(order.costPrice || 0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [comment, setComment] = useState<string>(`Оплата заказа #${order.id}`);
  const [loading, setLoading] = useState(false);

  const paymentMethods = [
    { id: 'cash', name: 'Наличные', icon: '' },
    { id: 'card', name: 'Карта', icon: '' },
    { id: 'online', name: 'Онлайн', icon: '' },
    { id: 'bank', name: 'Банковский перевод', icon: '' }
  ];

  const handleSubmit = async () => {
    if (amount <= 0) {
      alert('Введите корректную сумму');
      return;
    }

    setLoading(true);
    try {
      await onConfirm(order, amount, paymentMethod, comment, costPrice);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='modal-overlay'>
      <div className='modal-panel max-w-md'>
        <div className='card-inner'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6'>
            <div className='flex-1'>
              <h2 className='modal-title'>Закрытие заказа #{order.id}</h2>
              <p className='text-sm text-muted mt-1'>Создание платежа и завершение заказа</p>
            </div>
            <button onClick={onClose} className='btn secondary self-start sm:self-auto'>Закрыть</button>
          </div>

          <div className='space-y-5'>
            {/* Информация о заказе */}
            <div className='p-4 bg-surface rounded-xl'>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <div>
                  <span className='text-muted'>Клиент:</span>
                  <p className='font-medium'>{order.client}</p>
                </div>
                <div>
                  <span className='text-muted'>Устройство:</span>
                  <p className='font-medium'>{order.brand} {order.model}</p>
                </div>
                <div className='col-span-2'>
                  <span className='text-muted'>Проблема:</span>
                  <p className='font-medium'>{order.problem}</p>
                </div>
              </div>
            </div>

            {/* Сумма оплаты */}
            <div>
              <label className='label'>Сумма оплаты, ₽ *</label>
              <div className='relative'>
                <input 
                  type='number'
                  className='input text-lg font-medium pr-12'
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="0"
                  step="0.01"
                  autoFocus
                />
                <div className='absolute right-4 top-1/2 transform -translate-y-1/2 text-muted'>
                  ₽
                </div>
              </div>
              <p className='text-xs text-muted mt-1'>Изначальная стоимость: {(order.price || 0).toLocaleString('ru-RU')} ₽</p>
            </div>

            <div>
              <label className='label'>Себестоимость / расходы, ₽</label>
              <div className='relative'>
                <input
                  type='number'
                  className='input pr-12'
                  value={costPrice}
                  onChange={(e) => setCostPrice(Math.max(0, Number(e.target.value) || 0))}
                  min={0}
                  step='0.01'
                  placeholder='0'
                />
                <div className='absolute right-4 top-1/2 transform -translate-y-1/2 text-muted'>₽</div>
              </div>
              <p className='text-xs text-muted mt-1'>Закупка запчастей и другие расходы по заказу (только для CRM)</p>
            </div>

            {/* Способ оплаты */}
            <div>
              <label className='label'>Способ оплаты *</label>
              <div className='grid grid-cols-2 gap-2'>
                {paymentMethods.map(method => (
                  <button
                    key={method.id}
                    type='button'
                    className={`flex items-center gap-2 p-3 rounded-xl border transition ${paymentMethod === method.id ? 'border-primary text-primary' : 'border-border hover:bg-surface'}`}
                    onClick={() => setPaymentMethod(method.id)}
                  >
                    <span>{method.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Комментарий */}
            <div>
              <label className='label'>Комментарий к платежу</label>
              <textarea 
                className='textarea'
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder='Дополнительная информация...'
                rows={2}
              />
              <p className='text-xs text-muted mt-1'>Будет отображаться в истории платежей</p>
            </div>

            {/* Прибыль */}
            <div className='p-4 bg-surface rounded-xl'>
              <div className='space-y-2'>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-muted'>Себестоимость:</span>
                  <span className='text-muted'>{costPrice.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-muted'>Сумма оплаты:</span>
                  <span className='font-semibold'>{amount.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className='flex justify-between items-center pt-2 border-t border-border'>
                  <span className='text-sm font-medium'>Чистая прибыль:</span>
                  <span className={`font-bold text-lg ${amount - costPrice >= 0 ? 'text-success' : 'text-danger'}`}>
                    {(amount - costPrice).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div className='flex flex-col sm:flex-row gap-3 pt-2'>
              <button 
                className='btn secondary flex-1 order-2 sm:order-1'
                onClick={onClose}
                disabled={loading}
              >
                Отмена
              </button>
              <button 
                className='btn flex-1 order-1 sm:order-2'
                onClick={handleSubmit}
                disabled={loading || amount <= 0}
              >
                {loading ? (
                  <>
                    <div className='inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2'></div>
                    Обработка...
                  </>
                ) : (
                  <span className='text-sm sm:text-base'>Закрыть заказ и создать платёж</span>
                )}
              </button>
            </div>

            <p className='text-xs text-center text-muted mt-4'>
              Будет создана запись о платеже и статус заказа изменён на «Закрыт успешно»
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Компонент модального окна создания заказа
// Компонент модального окна создания заказа
// Компонент модального окна создания заказа
function OrderModal({ 
  onClose, 
  onSave,
  onPrint,
  brands,
  models,
  problems,
  onBrandsUpdate,
  onModelsUpdate,
  onProblemsUpdate,
  formatPhone: formatPhoneProp,
  selectedBrandId,
  setSelectedBrandId
}: { 
  onClose: () => void; 
  onSave: (order: Order) => void;
  onPrint: (orderId: number) => void;
  brands: Brand[];
  models: DeviceModel[];
  problems: Problem[];
  onBrandsUpdate: () => void;
  onModelsUpdate: () => void;
  onProblemsUpdate: () => void;
  formatPhone: (phone: string) => string;
  selectedBrandId: number | '';
  setSelectedBrandId: (id: number | '') => void;
}) {
  const [form, setForm] = useState({
    client: '', phone: '', email: '', clientAddress: '',
    problem: '', brand: '', model: '', color: '', deviceStorage: '', deviceType: 'Смартфон',
    imei: '', serialNumber: '', equipment: '', devicePassword: '',
    prepayment: '', estimatedPrice: '',
    managerName: '', executorName: '', dueAt: '', isUrgent: false, receiverNotes: '',
    partType: 'original' as 'original' | 'copy',
    inspection: {} as Record<string, any>,
    wishes: {} as Record<string, any>,
    status: 'Создана',
    price: '', costPrice: '', description: '', warranty: false, onSite: false, paymentMethod: 'cash'
  });
  const [printAfterSave, setPrintAfterSave] = useState(true)
  const [imeiLookupLoading, setImeiLookupLoading] = useState(false)
  const [imeiLookupMessage, setImeiLookupMessage] = useState('')
  const catalog = useDeviceCatalog()

  const lookupImei = async () => {
    const imei = String(form.imei || '').replace(/\D/g, '')
    if (imei.length !== 15) {
      setImeiLookupMessage(imei ? 'IMEI должен содержать 15 цифр' : '')
      return
    }
    setImeiLookupLoading(true)
    setImeiLookupMessage('')
    try {
      const response = await apiFetch(`/ai/agent/imei/${imei}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Не удалось определить устройство')
      setForm((prev) => ({
        ...prev,
        brand: data.brand || prev.brand,
        model: data.model || prev.model,
        color: data.color || prev.color,
        deviceStorage: data.storage || prev.deviceStorage,
        deviceType: data.deviceType || prev.deviceType,
      }))
      setImeiLookupMessage(
        [data.brand, data.model, data.color, data.storage].filter(Boolean).join(' • ') ||
          'IMEI проверен, но характеристики не найдены',
      )
    } catch (error: any) {
      setImeiLookupMessage(error?.message || 'Ошибка проверки IMEI')
    } finally {
      setImeiLookupLoading(false)
    }
  }

  const crmIssueNames = useMemo(
    () => problems.filter((p) => !form.deviceType || p.deviceType === form.deviceType).map((p) => p.name),
    [problems, form.deviceType],
  )
  const issueOptions = catalog.issueNames(crmIssueNames)

  useEffect(() => {
    void catalog.refreshContext({
      deviceType: form.deviceType,
      brandName: form.brand,
      modelName: form.model,
      issueCode: catalog.findIssueCode(form.problem),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.deviceType, form.brand, form.model, form.problem])

  const applyCatalogPrice = async (issueName: string, subtypeName?: string) => {
    if (!form.brand.trim() || !form.model.trim() || !issueName.trim()) return
    const lookupName = subtypeName?.trim() || issueName.trim()
    const matchedProblem = problems.find((p) => p.name.toLowerCase() === issueName.trim().toLowerCase())
    const result = await fetchCatalogPrice({
      brand: form.brand,
      model: form.model,
      problemName: lookupName,
      problemId: matchedProblem?.id,
    })
    if (result) {
      setForm((prev) => ({
        ...prev,
        price: String(result.priceMin),
        costPrice: String(result.costPrice),
        estimatedPrice: prev.estimatedPrice || String(result.priceMin),
      }))
    }
  }

  const handleIssueChange = (value: string) => {
    setForm((prev) => ({ ...prev, problem: value }))
    const inList = issueOptions.some((o) => o.toLowerCase() === value.trim().toLowerCase())
    if (inList && value.trim()) void applyCatalogPrice(value)
  }

  const handleIssueSubtypeChange = (value: string) => {
    setForm((prev) => ({ ...prev, description: value }))
    const inList = catalog.subtypeNames.some((o) => o.toLowerCase() === value.trim().toLowerCase())
    if (inList && value.trim() && form.problem.trim()) void applyCatalogPrice(form.problem, value)
  }

  const handlePartTypeChange = (value: string) => {
    const partType = value === 'copy' ? 'copy' : 'original'
    setForm((prev) => ({ ...prev, partType }))
    if (form.problem.trim()) {
      void fetchCatalogPrice({
        brand: form.brand,
        model: form.model,
        problemName: (form.description || form.problem).trim(),
        partType,
      }).then((result) => {
        if (!result) return
        setForm((prev) => ({
          ...prev,
          partType,
          price: String(result.priceMin),
          costPrice: String(result.costPrice),
          estimatedPrice: prev.estimatedPrice || String(result.priceMin),
        }))
      })
    }
  }

  // Состояние для выбора клиента
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [phoneSuggestOpen, setPhoneSuggestOpen] = useState(false);

  const searchClients = async (query: string) => {
    try {
      setClientLoading(true);
      const response = await apiFetch(`/clients/search/by-phone?phone=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const data = await response.json();
        setClients(Array.isArray(data) ? data : []);
      } else {
        setClients([]);
      }
    } catch (error) {
      console.error('Ошибка поиска клиентов:', error);
      setClients([]);
    } finally {
      setClientLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!form.problem.trim()) {
        alert('Укажите неисправность')
        return
      }

      const problemsList = [{
        problemName: form.problem.trim(),
        problemDescription: form.description?.trim() || '',
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        problemId: null,
      }]
      
      const totalPrice = problemsList.reduce((sum, p) => sum + (p.price || 0), 0)
      const totalCostPrice = problemsList.reduce((sum, p) => sum + (p.costPrice || 0), 0)
      
      const response = await apiFetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // normalize numbers / booleans
          prepayment: Number(form.prepayment) || 0,
          estimatedPrice: Number(form.estimatedPrice) || 0,
          isUrgent: Boolean(form.isUrgent),
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          inspection: (form as any).inspection || {},
          wishes: (form as any).wishes || {},
          problem: problemsList[0]?.problemName || form.problem, // для обратной совместимости
          problems: problemsList,
          price: totalPrice,
          costPrice: totalCostPrice,
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка создания заказа');
      }

      const newOrder = await response.json();
      onSave(newOrder);
      if (printAfterSave && newOrder?.id) {
        // Не блокируем закрытие модалки — просто открываем печать в новой вкладке
        try { onPrint(Number(newOrder.id)) } catch {}
      }
    } catch (error: any) {
      alert(error.message || 'Ошибка при создании заказа');
      console.error(error);
    }
  };

  // Локальная функция formatPhone для использования внутри компонента
  const formatPhoneLocal = (phone: string): string => {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      cleaned = '7' + cleaned;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('7')) {
      return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
    }
    
    return phone;
  };

  const { statuses: createStatuses } = useOrderStatuses()
  const statuses = createStatuses.length ? createStatuses : [...ORDER_STATUSES];

  useEffect(() => {
    if (!statuses.length) return
    setForm((prev) => (statuses.includes(prev.status) ? prev : { ...prev, status: statuses[0] }))
  }, [statuses])

  const paymentMethods = [
    { value: 'cash', label: 'Наличные' },
    { value: 'card', label: 'Карта' },
    { value: 'online', label: 'Онлайн' },
    { value: 'invoice', label: 'Счет' }
  ];

  return (
    <div className='modal-overlay'>
      <div className='modal-panel max-w-2xl'>
        <div className='card-inner'>
          <div className='flex justify-between items-center mb-6'>
            <h2 className='modal-title'>Новая заявка</h2>
            <button onClick={onClose} className='btn secondary'>Закрыть</button>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Поля клиента с выбором из существующих */}
            <div className="md:col-span-2">
              <label className="label">Клиент *</label>
              <div className="flex gap-2 mb-2">
                <button 
                  type="button"
                  className="btn secondary text-sm"
                  onClick={() => {
                    setShowClientSearch(true);
                    setClientSearch('');
                    setClients([]);
                  }}
                >
                  Выбрать из клиентов
                </button>
              </div>
              
              {selectedClientId ? (
                <div className="p-3 bg-surface border border-border rounded-xl mb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{form.client}</div>
                      <div className="text-sm text-muted">{formatPhoneLocal(form.phone)}</div>
                    </div>
                    <button 
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => {
                        setSelectedClientId('');
                        setForm(prev => ({ ...prev, client: '', phone: '' }));
                      }}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
              ) : null}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <input 
                    className="input" 
                    value={form.client} 
                    onChange={(e) => setForm({...form, client: e.target.value})} 
                    placeholder="ФИО клиента"
                  />
                </div>
                <div>
                  <div className="relative">
                    <input 
                      className="input" 
                      value={form.phone} 
                      onChange={(e) => { 
                        const raw = e.target.value;
                        const formatted = formatPhoneProp(raw); 
                        setForm(prev => ({...prev, phone: formatted})); 
                        if (raw && raw.replace(/\D/g, '').length >= 5) {
                          searchClients(raw);
                          setPhoneSuggestOpen(true);
                        } else {
                          setPhoneSuggestOpen(false);
                        }
                      }} 
                      onFocus={() => {
                        if (clients.length > 0) setPhoneSuggestOpen(true);
                      }}
                      onBlur={() => {
                        // небольшой таймаут, чтобы успеть кликнуть по пункту
                        setTimeout(() => setPhoneSuggestOpen(false), 150);
                      }}
                      placeholder="+7 (___) ___-__-__"
                    />
                    {phoneSuggestOpen && (
                      <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-bg shadow-lg overflow-hidden">
                        {clientLoading ? (
                          <div className="p-3 text-sm text-muted">Поиск...</div>
                        ) : clients.length === 0 ? (
                          <div className="p-3 text-sm text-muted">Клиенты не найдены</div>
                        ) : (
                          <div className="max-h-56 overflow-auto">
                            {clients.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full text-left p-3 hover:bg-surface transition border-b border-border last:border-b-0"
                                onMouseDown={(evt) => evt.preventDefault()}
                                onClick={() => {
                                  setSelectedClientId(c.id);
                                  setForm(prev => ({
                                    ...prev,
                                    client: c.name,
                                    phone: c.phone,
                                    email: c.email || ''
                                  }));
                                  setPhoneSuggestOpen(false);
                                }}
                              >
                                <div className="font-medium">{c.name}</div>
                                <div className="text-xs text-muted mt-1">{formatPhoneLocal(c.phone)}{c.email ? ` · ${c.email}` : ''}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={(form as any).email || ''}
                onChange={(e) => setForm(prev => ({...prev, email: e.target.value}))}
                placeholder="email@example.com"
              />
            </div>
            
            <div><label className='label'>Статус</label><Select className='select' value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</Select></div>

            <div className='md:col-span-2 p-4 bg-surface rounded-xl border border-border'>
              <h3 className='font-semibold text-sm mb-3'>Устройство и неисправность</h3>
              <DeviceCatalogFields
                catalog={catalog}
                deviceType={form.deviceType}
                brand={form.brand}
                model={form.model}
                issue={form.problem}
                issueSubtype={form.description || ''}
                issueOptions={issueOptions}
                partType={form.partType}
                onDeviceTypeChange={(deviceType) => setForm((prev) => ({ ...prev, deviceType }))}
                onBrandChange={(brand) => setForm((prev) => ({ ...prev, brand }))}
                onModelChange={(model) => setForm((prev) => ({ ...prev, model }))}
                onIssueChange={handleIssueChange}
                onIssueSubtypeChange={handleIssueSubtypeChange}
                onPartTypeChange={handlePartTypeChange}
              />
            </div>

            <div>
              <label className='label'>Цвет</label>
              <input className='input' value={(form as any).color || ''} onChange={(e) => setForm(prev => ({...prev, color: e.target.value}))} placeholder='Например: черный' />
            </div>

            <div>
              <label className='label'>IMEI</label>
              <div className='flex gap-2'>
                <input
                  className='input'
                  inputMode='numeric'
                  value={(form as any).imei || ''}
                  onChange={(e) => setForm(prev => ({...prev, imei: e.target.value.replace(/\D/g, '').slice(0, 15)}))}
                  onBlur={lookupImei}
                  placeholder='15 цифр'
                />
                <button
                  type='button'
                  className='btn secondary shrink-0'
                  disabled={imeiLookupLoading || String(form.imei || '').replace(/\D/g, '').length !== 15}
                  onClick={lookupImei}
                >
                  {imeiLookupLoading ? '…' : 'Определить'}
                </button>
              </div>
              {imeiLookupMessage && <div className='text-xs text-muted mt-1'>{imeiLookupMessage}</div>}
            </div>

            <div>
              <label className='label'>Память</label>
              <input
                className='input'
                value={(form as any).deviceStorage || ''}
                onChange={(e) => setForm(prev => ({ ...prev, deviceStorage: e.target.value }))}
                placeholder='128 GB'
              />
            </div>

            <div>
              <label className='label'>S/N</label>
              <input className='input' value={(form as any).serialNumber || ''} onChange={(e) => setForm(prev => ({...prev, serialNumber: e.target.value}))} placeholder='Серийный номер' />
            </div>

            <div className='md:col-span-2'>
              <label className='label'>Комплектация</label>
              <input className='input' value={(form as any).equipment || ''} onChange={(e) => setForm(prev => ({...prev, equipment: e.target.value}))} placeholder='Например: кабель, чехол, коробка' />
            </div>

            <div>
              <label className='label'>Пароль</label>
              <input className='input' value={(form as any).devicePassword || ''} onChange={(e) => setForm(prev => ({...prev, devicePassword: e.target.value}))} placeholder='Пароль/код' />
            </div>

            <div className='md:col-span-2'>
              <label className='label'>Адрес клиента</label>
              <input className='input' value={(form as any).clientAddress || ''} onChange={(e) => setForm(prev => ({...prev, clientAddress: e.target.value}))} placeholder='Адрес клиента' />
            </div>

            <OrderPricingFields
              prepayment={(form as any).prepayment || ''}
              estimatedPrice={(form as any).estimatedPrice || ''}
              costPrice={form.costPrice}
              price={form.price}
              paymentMethod={form.paymentMethod}
              warranty={form.warranty}
              onSite={form.onSite}
              paymentMethods={paymentMethods}
              onPrepaymentChange={(value) => setForm((prev) => ({ ...prev, prepayment: value }))}
              onEstimatedPriceChange={(value) => setForm((prev) => ({ ...prev, estimatedPrice: value }))}
              onCostPriceChange={(value) => setForm((prev) => ({ ...prev, costPrice: value }))}
              onPriceChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
              onPaymentMethodChange={(value) => setForm((prev) => ({ ...prev, paymentMethod: value }))}
              onWarrantyChange={(checked) => setForm((prev) => ({ ...prev, warranty: checked }))}
              onOnSiteChange={(checked) => setForm((prev) => ({ ...prev, onSite: checked }))}
            />

            <div>
              <label className='label'>Менеджер</label>
              <input className='input' value={(form as any).managerName || ''} onChange={(e) => setForm(prev => ({...prev, managerName: e.target.value}))} placeholder='Менеджер' />
            </div>

            <div>
              <label className='label'>Исполнитель</label>
              <input className='input' value={(form as any).executorName || ''} onChange={(e) => setForm(prev => ({...prev, executorName: e.target.value}))} placeholder='Исполнитель' />
            </div>

            <div>
              <label className='label'>Срок</label>
              <input type='datetime-local' className='input' value={(form as any).dueAt ? String((form as any).dueAt).slice(0, 16) : ''} onChange={(e) => setForm(prev => ({...prev, dueAt: e.target.value}))} />
            </div>

            <div className='flex items-center gap-4'>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input type='checkbox' checked={Boolean((form as any).isUrgent)} onChange={(e) => setForm(prev => ({...prev, isUrgent: e.target.checked}))} className='rounded border-border' />
                <span className='text-sm'>Срочно</span>
              </label>
            </div>

            <div className='md:col-span-2'>
              <label className='label'>Заметки приемщика</label>
              <textarea
                className='textarea'
                value={(form as any).receiverNotes || ''}
                onChange={(e) => setForm(prev => ({...prev, receiverNotes: e.target.value}))}
                placeholder='Заметки приемщика...'
                rows={2}
              />
            </div>

            <div className='md:col-span-2'>
              <label className='label'>Дополнительное описание</label>
              <textarea className='textarea' value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder='Дополнительные заметки...' rows={3}/>
            </div>
          </div>

          <div className='flex flex-col sm:flex-row justify-end gap-3 mt-6 sm:mt-8 pt-6 border-t border-border'>
            <label className='flex items-center gap-2 cursor-pointer mr-auto select-none'>
              <input
                type='checkbox'
                checked={printAfterSave}
                onChange={(e) => setPrintAfterSave(e.target.checked)}
                className='rounded border-border'
              />
              <span className='text-sm'>Печатать квитанцию после сохранения</span>
            </label>
            <button className='btn secondary order-2 sm:order-1' onClick={onClose}>Отмена</button>
            <button 
              className='btn order-1 sm:order-2 flex-1 sm:flex-initial' 
              onClick={handleSubmit} 
              disabled={!form.client || !form.phone || !form.problem.trim()}
            >
              Создать заявку
            </button>
          </div>
        </div>
      </div>

      {/* Модальное окно выбора клиента */}
      {showClientSearch && (
        <div className="modal-overlay">
          <div className="card w-full max-w-md">
            <div className="card-inner">
              <div className="flex justify-between items-center mb-4">
                <h3 className="modal-title">Выбор клиента</h3>
                <button onClick={() => setShowClientSearch(false)} className="btn secondary">Закрыть</button>
              </div>
              
              <div className="mb-4">
                <input
                  className="input"
                  placeholder="Поиск по телефону или имени..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    if (e.target.value.length >= 2) {
                      searchClients(e.target.value);
                    }
                  }}
                  autoFocus
                />
                {clientLoading && (
                  <div className="text-xs text-muted mt-1 flex items-center gap-1">
                    <div className='inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-primary'></div>
                    Поиск...
                  </div>
                )}
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {clients.length > 0 ? (
                  clients.map(client => (
                    <button
                      key={client.id}
                      type="button"
                      className="w-full p-3 text-left bg-bg hover:bg-surface rounded-xl border border-border transition"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setForm(prev => ({
                          ...prev,
                          client: client.name,
                          phone: client.phone,
                          email: client.email || ''
                        }));
                        setShowClientSearch(false);
                        setClientSearch('');
                      }}
                    >
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-muted mt-1">{formatPhoneLocal(client.phone)}</div>
                      {client.email && (
                        <div className="text-xs text-muted mt-1">{client.email}</div>
                      )}
                      <div className="text-xs text-muted mt-2">
                        {client.totalOrders} заказов · {client.totalSpent?.toLocaleString('ru-RU')} ₽
                      </div>
                    </button>
                  ))
                ) : clientSearch.length >= 2 ? (
                  <div className="text-center py-8 text-muted">
                    <p>Клиенты не найдены</p>
                  </div>
                ) : clientSearch.length === 0 ? (
                  <div className="text-center py-8 text-muted">
                    <p>Введите телефон или имя для поиска</p>
                  </div>
                ) : null}
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-border">
                <button className="btn secondary" onClick={() => setShowClientSearch(false)}>
                  Отмена
                </button>
                <button 
                  className="btn ghost"
                  onClick={() => {
                    setSelectedClientId('');
                    setForm(prev => ({ ...prev, client: '', phone: '' }));
                    setShowClientSearch(false);
                  }}
                >
                  Ввести вручную
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}