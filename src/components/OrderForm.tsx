import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import Select from './Select'

type Order = {
  id?: number;
  client: string;
  phone: string;
  problem: string;
  brand: string;
  model: string;
  deviceType?: string;
  status: string;
  price: number;
  costPrice: number;
  description?: string;
  warranty?: boolean;
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



export default function Orders(){
  const [rows, setRows] = useState<Order[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  
  // Данные для справочников
  const [brands, setBrands] = useState<Brand[]>([])
  const [problems, setProblems] = useState<Problem[]>([])

  // Загрузка данных
  useEffect(() => {
    loadOrders();
    loadBrands();
    loadProblems();
  }, [])

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

  async function loadBrands() {
    try {
      const response = await apiFetch('/brands');
      const data = await response.json();
      setBrands(data);
    } catch (error) {
      console.error('Ошибка загрузки брендов:', error);
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

  async function updateOrderStatus(id: number, status: string) {
    try {
      const response = await apiFetch(`/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        setRows(prev => prev.map(order => 
          order.id === id ? { ...order, status } : order
        ));
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
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
      }
    } catch (error) {
      console.error('Ошибка удаления заказа:', error);
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

  // Функция для форматирования телефона
  const formatPhone = (phone: string): string => {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    // Если номер начинается с 8, меняем на +7
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Если номер начинается с 9 и длина 10 цифр, добавляем +7
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      cleaned = '7' + cleaned;
    }
    
    // Форматируем: +7 (XXX) XXX-XX-XX
    if (cleaned.length === 11 && cleaned.startsWith('7')) {
      return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
    }
    
    return phone;
  };

  // Обработчик ввода телефона
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

  const statuses = ['В работе', 'Готов', 'Закрыт', 'Отменен'];

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'В работе': return 'bg-blue-500/10 text-blue-500';
      case 'Готов': return 'bg-green-500/10 text-green-500';
      case 'Закрыт': return 'bg-gray-500/10 text-gray-500';
      case 'Отменен': return 'bg-red-500/10 text-red-500';
      default: return 'bg-surface border border-border';
    }
  };

  // Подсчет статистики вручную
  const totalOrders = rows.length;
  const totalRevenue = rows.reduce((sum, order) => sum + (order.price || 0), 0);
  const totalCost = rows.reduce((sum, order) => sum + (order.costPrice || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const inProgress = rows.filter(o => o.status === 'В работе').length;
  const ready = rows.filter(o => o.status === 'Готов').length;

  return (
    <div className='space-y-6'>
      {/* Заголовок и статистика */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Заказы</h1>
          <div className='flex gap-4 mt-2 text-sm'>
            <span className='text-muted'>Всего: <strong>{totalOrders}</strong></span>
            <span className='text-blue-500'>В работе: <strong>{inProgress}</strong></span>
            <span className='text-green-500'>Готово: <strong>{ready}</strong></span>
            <span className='text-primary'>Выручка: <strong>{totalRevenue.toLocaleString('ru-RU')} ₽</strong></span>
            <span className='text-success'>Прибыль: <strong>{totalProfit.toLocaleString('ru-RU')} ₽</strong></span>
          </div>
        </div>
        <div className='flex gap-2'>
          <button 
            className='btn'
            onClick={() => setOpen(true)}
          >
            Создать заказ
          </button>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className='card p-4'>
        <div className='flex flex-col md:flex-row gap-4'>
          <div className='flex-1'>
            <div className='flex items-center gap-2 mb-2'>
              <button 
                className={`tag ${selectedStatus === '' ? 'tag-active' : ''}`}
                onClick={() => setSelectedStatus('')}
              >
                Все
              </button>
              {statuses.map(status => (
                <button
                  key={status}
                  className={`tag ${selectedStatus === status ? 'tag-active' : ''}`}
                  onClick={() => filterByStatus(status)}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className='flex items-center gap-2'>
              <input 
                placeholder='Поиск по клиенту или телефону...'
                className='input flex-1'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button 
                className='btn secondary'
                onClick={handleSearch}
              >
                Найти
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица заказов */}
      <div className='card overflow-hidden'>
        {loading ? (
          <div className='py-12 text-center text-muted'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
            <p className='mt-2'>Загрузка заказов...</p>
          </div>
        ) : (
          <div className='overflow-auto'>
            <table className='table min-w-[1200px]'>
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Статус</th>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Проблема</th>
                  <th>Устройство</th>
                  <th>Себест.</th>
                  <th>Стоимость</th>
                  <th>Прибыль</th>
                  <th>Создан</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className='py-12 text-center text-muted'>
                      <div className='text-4xl mb-2'>📋</div>
                      <p className='text-lg font-medium'>Заказов пока нет</p>
                      <p className='text-sm mt-1'>Создайте первый заказ</p>
                    </td>
                  </tr>
                ) : (
                  rows.map(order => {
                    const profit = (order.price || 0) - (order.costPrice || 0);
                    return (
                      <tr key={order.id} className='hover:bg-surface/30 transition-colors'>
                        <td className='font-medium'>#{order.id}</td>
                        <td>
                          <Select 
                            className={`select text-xs px-2 py-1 rounded-lg ${getStatusColor(order.status)}`}
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order.id!, e.target.value)}
                          >
                            {statuses.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </Select>
                        </td>
                        <td>{order.client}</td>
                        <td className='text-muted'>{formatPhone(order.phone)}</td>
                        <td className='max-w-[200px] truncate' title={order.problem}>
                          {order.problem}
                        </td>
                        <td>
                          <div className='text-sm'>
                            <div>{order.brand} {order.model}</div>
                          </div>
                        </td>
                        <td className='text-muted text-sm'>
                          {(order.costPrice || 0).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className='font-semibold'>
                          {(order.price || 0).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className={`font-semibold ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {profit.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className='text-muted text-sm whitespace-nowrap'>
                          {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                        </td>
                        <td>
                          <div className='flex gap-2'>
                            <button 
                              className='text-xs px-2 py-1 rounded bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition'
                              onClick={() => deleteOrder(order.id!)}
                            >
                              Удалить
                            </button>
                          </div>
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

      {/* Модальное окно создания заказа */}
      {open && (
        <SimpleOrderModal 
          onClose={() => setOpen(false)} 
          onSave={(newOrder) => {
            setRows([newOrder, ...rows]);
            setOpen(false);
          }}
          brands={brands}
          problems={problems}
          formatPhone={handlePhoneInput}
        />
      )}
    </div>
  );
}

// Упрощенная модалка
function SimpleOrderModal({ 
  onClose, 
  onSave,
  brands,
  problems,
  formatPhone
}: { 
  onClose: () => void; 
  onSave: (order: Order) => void;
  brands: Brand[];
  problems: Problem[];
  formatPhone: (phone: string) => string;
}) {
  const [form, setForm] = useState({
    client: '',
    phone: '',
    problem: '',
    brand: '',
    model: '',
    status: 'В работе',
    price: '',
    costPrice: '',
    description: '',
    warranty: false,
    onSite: false
  });

  const handleSubmit = async () => {
    try {
      const response = await apiFetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price: Number(form.price) || 0,
          costPrice: Number(form.costPrice) || 0,
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка создания заказа');
      }

      const newOrder = await response.json();
      onSave(newOrder);
    } catch (error: any) {
      alert(error.message || 'Ошибка при создании заказа');
      console.error(error);
    }
  };

  const handleProblemSelect = (problemId: number) => {
    const selectedProblem = problems.find(p => p.id === problemId);
    if (selectedProblem) {
      setForm(prev => ({
        ...prev,
        problem: selectedProblem.name,
        price: selectedProblem.defaultPrice.toString(),
        costPrice: selectedProblem.defaultCostPrice.toString()
      }));
    }
  };

  const deviceTypes = ['Смартфон', 'Планшет', 'Ноутбук', 'ПК', 'Другое'];

  return (
    <div className='modal-overlay'>
      <div className='card w-full max-w-2xl'>
        <div className='card-inner'>
          <div className='flex justify-between items-center mb-6'>
            <h2 className='modal-title'>Новый заказ</h2>
            <button onClick={onClose} className='text-muted hover:text-text'>✕</button>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Основные поля */}
            <div>
              <label className='label'>Клиент *</label>
              <input
                className='input'
                value={form.client}
                onChange={(e) => setForm({...form, client: e.target.value})}
                placeholder='ФИО клиента'
              />
            </div>

            <div>
              <label className='label'>Телефон *</label>
              <input
                className='input'
                value={form.phone}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  setForm({...form, phone: formatted});
                }}
                placeholder='+7 (___) ___-__-__'
              />
            </div>

            <div>
              <label className='label'>Бренд</label>
              <Select
                className='select'
                value={form.brand}
                onChange={(e) => setForm({...form, brand: e.target.value})}
              >
                <option value="">Выберите бренд</option>
                {brands.map(brand => (
                  <option key={brand.id} value={brand.name}>
                    {brand.icon} {brand.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className='label'>Модель</label>
              <input
                className='input'
                value={form.model}
                onChange={(e) => setForm({...form, model: e.target.value})}
                placeholder='Модель устройства'
              />
            </div>

            {/* Проблема */}
            <div className='md:col-span-2'>
              <label className='label'>Проблема *</label>
              <Select
                className='select mb-2'
                value={form.problem}
                onChange={(e) => handleProblemSelect(Number(e.target.value))}
              >
                <option value="">Выберите типичную поломку</option>
                {problems.map(problem => (
                  <option key={problem.id} value={problem.id}>
                    {problem.name} ({problem.defaultPrice}₽)
                  </option>
                ))}
              </Select>
              <textarea
                className='textarea'
                value={form.problem}
                onChange={(e) => setForm({...form, problem: e.target.value})}
                placeholder='Опишите проблему...'
                rows={2}
              />
            </div>

            {/* Стоимости */}
            <div>
              <label className='label'>Себестоимость, ₽</label>
              <input
                type='number'
                className='input'
                value={form.costPrice}
                onChange={(e) => setForm({...form, costPrice: e.target.value})}
                placeholder='0'
              />
            </div>

            <div>
              <label className='label'>Стоимость для клиента, ₽</label>
              <input
                type='number'
                className='input'
                value={form.price}
                onChange={(e) => setForm({...form, price: e.target.value})}
                placeholder='0'
              />
            </div>

            {/* Опции */}
            <div className='flex gap-4 items-center md:col-span-2'>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={form.warranty}
                  onChange={(e) => setForm({...form, warranty: e.target.checked})}
                  className='rounded border-border'
                />
                <span className='text-sm'>Гарантийный</span>
              </label>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={form.onSite}
                  onChange={(e) => setForm({...form, onSite: e.target.checked})}
                  className='rounded border-border'
                />
                <span className='text-sm'>Выездной</span>
              </label>
            </div>

            {/* Прибыль */}
            <div className='p-3 bg-surface/50 rounded-xl md:col-span-2'>
              <div className='flex justify-between items-center'>
                <span className='text-sm text-muted'>Прибыль:</span>
                <span className={`font-bold ${(Number(form.price) - Number(form.costPrice)) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {(Number(form.price) - Number(form.costPrice)).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>
          </div>

          <div className='flex justify-end gap-3 mt-8 pt-6 border-t border-border'>
            <button className='btn secondary' onClick={onClose}>
              Отмена
            </button>
            <button 
              className='btn' 
              onClick={handleSubmit}
              disabled={!form.client || !form.phone || !form.problem}
            >
              Создать заказ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}