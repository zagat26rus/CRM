import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { getOrderStatusColor } from '../utils/orderStatuses';

type Client = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  telegram: string;
  whatsapp: string;
  vk: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  createdAt: string;
  updatedAt: string;
  recentOrders?: any[];
  activeOrdersCount?: number;
  avgOrderValue?: number;
};

type ClientOrder = {
  id: number;
  status: string;
  problem?: string;
  brand?: string;
  model?: string;
  deviceType?: string;
  price: number;
  createdAt: string;
  type?: 'repair' | 'shop';
  orderNumber?: string;
};



export default function Clients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadClients();
    loadStats();
  }, [page, search]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    const id = Number(openId);
    if (!Number.isFinite(id) || id <= 0) return;
    loadClientDetails(id);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  async function loadClients() {
    try {
      setLoading(true);
      let url = `/clients?page=${page}&limit=20`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      
      const response = await apiFetch(url);
      const data = await response.json();
      setClients(data.clients || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (error) {
      console.error('Ошибка загрузки клиентов:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await apiFetch('/clients/stats/summary');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  }

  async function loadClientDetails(id: number) {
    try {
      const response = await apiFetch(`/clients/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedClient(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки деталей клиента:', error);
    }
  }

  async function createClient(clientData: any) {
    try {
      const response = await apiFetch('/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка создания клиента');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async function updateClient(id: number, clientData: any) {
    try {
      const response = await apiFetch(`/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка обновления клиента');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async function deleteClient(id: number, name?: string) {
    const label = name ? `«${name}»` : `#${id}`
    if (!confirm(`Удалить клиента ${label}? Карточка клиента будет удалена, история заказов останется в CRM.`)) return

    try {
      const response = await apiFetch(`/clients/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || `Ошибка ${response.status}`)
      }

      if (selectedClient?.id === id) setSelectedClient(null)
      if (editingClient?.id === id) {
        setEditingClient(null)
        setShowModal(false)
      }
      loadClients()
      loadStats()
    } catch (error: any) {
      console.error('Ошибка удаления клиента:', error)
      alert(error?.message || 'Ошибка удаления клиента')
    }
  }

  const handleSearch = () => {
    setPage(1);
    loadClients();
  };

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

  const handleSaveClient = async (clientData: any) => {
    try {
      if (editingClient) {
        await updateClient(editingClient.id, clientData);
        alert('Клиент обновлен');
      } else {
        await createClient(clientData);
        alert('Клиент создан');
      }
      
      setShowModal(false);
      setEditingClient(null);
      loadClients();
      loadStats();
    } catch (error: any) {
      alert(error.message || 'Ошибка сохранения клиента');
    }
  };

  const getStatusColor = getOrderStatusColor;

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4'>
        <div className='min-w-0'>
          <h1 className='text-2xl font-bold'>Клиенты</h1>
          {stats && (
            <div className='flex gap-4 mt-2 text-sm flex-wrap'>
              <span className='text-muted'>Всего клиентов: <strong>{stats.totalClients}</strong></span>
              <span className='text-muted'>Активные за 30 дней: <strong>{stats.activeLast30Days}</strong></span>
              <span className='text-primary'>Общая выручка: <strong>{stats.totalRevenue?.toLocaleString('ru-RU')} ₽</strong></span>
              <span className='text-muted'>Средний чек: <strong>{Math.round(stats.avgClientValue || 0).toLocaleString('ru-RU')} ₽</strong></span>
              <span className='text-muted'>Всего заказов: <strong>{stats.totalOrders}</strong></span>
            </div>
          )}
        </div>
        <div className='grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto'>
          <button className='btn secondary w-full text-xs sm:text-sm whitespace-nowrap' onClick={() => {}}>
            Экспорт
          </button>
          <button className='btn w-full text-xs sm:text-sm whitespace-nowrap' onClick={() => setShowModal(true)}>
            Добавить клиента
          </button>
        </div>
      </div>

      <div className='card p-4'>
        <div className='grid grid-cols-2 sm:flex sm:items-center gap-2'>
          <input 
            placeholder='Поиск по имени, телефону или email...' 
            className='input col-span-2 sm:col-span-1 sm:flex-1' 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className='btn secondary' onClick={handleSearch}>Найти</button>
          <button className='btn ghost' onClick={() => { setSearch(''); setPage(1); }}>Сбросить</button>
        </div>
      </div>

      <div className='card overflow-hidden'>
        {loading ? (
          <div className='py-12 text-center text-muted'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
            <p className='mt-2'>Загрузка клиентов...</p>
          </div>
        ) : (
          <div className='overflow-auto'>
            <table className='w-full min-w-[980px] table-auto text-sm'>
              <thead>
                <tr>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[4%]'>ID</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[16%]'>Клиент</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[18%]'>Контакты</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[16%]'>Статистика</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[12%]'>Последний заказ</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[8%]'>Создан</th>
                  <th className='text-left font-semibold text-muted py-3 px-3 w-[26%]'>Действия</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-12 text-center text-muted'>
                      <p className='text-lg font-medium'>Клиентов пока нет</p>
                      <p className='text-sm mt-1'>Добавьте первого клиента</p>
                    </td>
                  </tr>
                ) : (
                  clients.map(client => (
                    <tr key={client.id} className='hover:bg-surface transition-colors'>
                      <td className='py-3 px-3 border-t border-border font-medium'>#{client.id}</td>
                      <td className='py-3 px-3 border-t border-border'>
                        <div className='font-medium'>{client.name}</div>
                        {client.notes && (
                          <div className='text-xs text-muted truncate max-w-[320px]' title={client.notes}>
                            {client.notes}
                          </div>
                        )}
                      </td>
                      <td className='py-3 px-3 border-t border-border'>
                        <div className='space-y-1'>
                          <div className='text-sm'>{formatPhone(client.phone)}</div>
                          {client.email && (
                            <div className='text-sm text-muted'>{client.email}</div>
                          )}
                          {(client.telegram || client.whatsapp || client.vk) && (
                            <div className='flex gap-2 text-xs flex-wrap'>
                              {client.telegram && <span className='text-muted'>Telegram</span>}
                              {client.whatsapp && <span className='text-muted'>WhatsApp</span>}
                              {client.vk && <span className='text-muted'>ВКонтакте</span>}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className='py-3 px-3 border-t border-border'>
                        <div className='space-y-1'>
                          <div className='flex items-center gap-2 flex-wrap'>
                            <span className='text-sm'>Заказы:</span>
                            <span className='font-medium'>{client.totalOrders}</span>
                            {client.activeOrdersCount ? (
                              <span className='text-xs bg-bg border border-border px-2 py-0.5 rounded text-muted whitespace-nowrap'>
                                {client.activeOrdersCount} активных
                              </span>
                            ) : null}
                          </div>
                          <div className='text-sm text-muted'>
                            Выручка: {(client.totalSpent || 0).toLocaleString('ru-RU')} ₽
                          </div>
                          {client.avgOrderValue ? (
                            <div className='text-xs text-muted'>
                              Средний чек: {Math.round(client.avgOrderValue).toLocaleString('ru-RU')} ₽
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className='py-3 px-3 border-t border-border'>
                        {client.lastOrderDate ? (
                          <div className='space-y-1'>
                            <div className='text-sm'>
                              {new Date(client.lastOrderDate).toLocaleDateString('ru-RU')}
                            </div>
                            {client.recentOrders && client.recentOrders.length > 0 && (
                              <div className='text-xs text-muted whitespace-nowrap'>
                                Последний заказ: #{client.recentOrders[0].id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className='text-muted text-sm'>Нет заказов</span>
                        )}
                      </td>
                      <td className='py-3 px-3 border-t border-border text-muted text-sm'>
                        {new Date(client.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className='py-3 px-3 border-t border-border'>
                        <div className='flex flex-wrap gap-2'>
                          <button 
                            className='text-sm px-3 py-1.5 rounded bg-bg border border-border hover:bg-surface transition whitespace-nowrap'
                            onClick={() => {
                              setEditingClient(client);
                              setShowModal(true);
                            }}
                          >
                            Редактировать
                          </button>
                          <button 
                            className='text-sm px-3 py-1.5 rounded bg-bg border border-border hover:bg-surface transition whitespace-nowrap'
                            onClick={() => loadClientDetails(client.id)}
                          >
                            Детали
                          </button>
                          <button 
                            className='text-sm px-3 py-1.5 rounded bg-bg text-danger border border-danger hover:bg-surface transition whitespace-nowrap'
                            onClick={() => deleteClient(client.id, client.name)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className='flex justify-center items-center gap-2 p-4 border-t border-border'>
            <button
              className='btn ghost text-sm px-3 py-1'
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Назад
            </button>
            <span className='text-sm text-muted'>
              Страница {page} из {totalPages}
            </span>
            <button
              className='btn ghost text-sm px-3 py-1'
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Вперед
            </button>
          </div>
        )}
      </div>

      {/* Модальное окно создания/редактирования клиента */}
      {showModal && (
        <ClientModal
          client={editingClient}
          onClose={() => {
            setShowModal(false);
            setEditingClient(null);
          }}
          onSave={handleSaveClient}
          onDelete={editingClient ? (id, name) => deleteClient(id, name) : undefined}
          isEdit={!!editingClient}
          formatPhone={handlePhoneInput}
          getStatusColor={getStatusColor}
        />
      )}

      {/* Модальное окно деталей клиента */}
      {selectedClient && (
        <ClientDetailsModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onDelete={(id, name) => deleteClient(id, name)}
          formatPhone={formatPhone}
          getStatusColor={getStatusColor}
        />
      )}
    </div>
  );
}

function ClientModal({ 
  client, 
  onClose, 
  onSave,
  onDelete,
  isEdit,
  formatPhone,
  getStatusColor
}: { 
  client: Client | null; 
  onClose: () => void; 
  onSave: (clientData: any) => void;
  onDelete?: (id: number, name?: string) => void;
  isEdit: boolean;
  formatPhone: (phone: string) => string;
  getStatusColor: (status: string) => string;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: client?.name || '',
    phone: client?.phone || '',
    email: client?.email || '',
    notes: client?.notes || '',
    telegram: client?.telegram || '',
    whatsapp: client?.whatsapp || '',
    vk: client?.vk || '',
  });
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    setForm({
      name: client?.name || '',
      phone: client?.phone || '',
      email: client?.email || '',
      notes: client?.notes || '',
      telegram: client?.telegram || '',
      whatsapp: client?.whatsapp || '',
      vk: client?.vk || '',
    });
  }, [client]);

  useEffect(() => {
    if (!isEdit || !client?.id) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOrdersLoading(true);
        const res = await apiFetch(`/clients/${client.id}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setOrders(Array.isArray(data.orders) ? data.orders : []);
        }
      } catch (e) {
        console.error('Ошибка загрузки заказов клиента:', e);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, client?.id]);

  function openOrder(order: ClientOrder) {
    if (order.type === 'shop') {
      navigate('/shop');
      onClose();
      return;
    }
    navigate(`/orders?open=${order.id}`);
    onClose();
  }

  const handleSubmit = async () => {
    if (!form.name || !form.phone) {
      alert('Заполните обязательные поля: имя и телефон');
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
      <div className='card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col'>
        <div className='card-inner overflow-y-auto flex-1'>
          <div className='flex flex-wrap justify-between items-center gap-3 mb-6'>
            <h2 className='modal-title min-w-0'>{isEdit ? 'Редактирование клиента' : 'Новый клиент'}</h2>
            <button onClick={onClose} className='btn secondary'>Закрыть</button>
          </div>

          <div className='space-y-4'>
            <div>
              <label className='label'>Имя *</label>
              <input
                className='input'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder='ФИО клиента'
                autoFocus
              />
            </div>

            <div>
              <label className='label'>Телефон *</label>
              <input
                className='input'
                value={form.phone}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  setForm({ ...form, phone: formatted });
                }}
                placeholder='+7 (___) ___-__-__'
              />
            </div>

            <div>
              <label className='label'>Email</label>
              <input
                type='email'
                className='input'
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder='email@example.com'
              />
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
              <div>
                <label className='label'>Telegram</label>
                <input
                  className='input'
                  value={form.telegram}
                  onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  placeholder='@username'
                />
              </div>
              <div>
                <label className='label'>WhatsApp</label>
                <input
                  className='input'
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder='Номер WhatsApp'
                />
              </div>
              <div>
                <label className='label'>ВКонтакте</label>
                <input
                  className='input'
                  value={form.vk}
                  onChange={(e) => setForm({ ...form, vk: e.target.value })}
                  placeholder='vk.com/id или @ник'
                />
              </div>
            </div>

            <div>
              <label className='label'>Заметки</label>
              <textarea
                className='textarea'
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder='Дополнительная информация о клиенте...'
                rows={3}
              />
            </div>

            {isEdit && client && (
              <div className='space-y-3'>
                <div className='p-3 bg-surface rounded-xl text-sm grid grid-cols-1 sm:grid-cols-3 gap-2'>
                  <div>
                    <span className='text-muted'>Заказов всего: </span>
                    <span className='font-medium'>{client.totalOrders}</span>
                  </div>
                  <div>
                    <span className='text-muted'>Выручка: </span>
                    <span className='font-medium'>{(client.totalSpent || 0).toLocaleString('ru-RU')} ₽</span>
                  </div>
                  <div>
                    <span className='text-muted'>Последний заказ: </span>
                    <span>
                      {client.lastOrderDate ? new Date(client.lastOrderDate).toLocaleDateString('ru-RU') : 'Нет'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className='label'>Заказы клиента</label>
                  <div className='max-h-56 overflow-y-auto rounded-xl border border-border bg-bg/40 p-2 space-y-2'>
                    {ordersLoading ? (
                      <div className='text-sm text-muted py-6 text-center'>Загрузка заказов...</div>
                    ) : orders.length === 0 ? (
                      <div className='text-sm text-muted py-6 text-center'>Заказов пока нет</div>
                    ) : (
                      orders.map((order) => {
                        const isShop = order.type === 'shop';
                        const title = isShop
                          ? `Магазин ${order.orderNumber || `#${order.id}`}`
                          : `Заказ #${order.id}`;
                        const subtitle = isShop
                          ? 'Заказ из магазина'
                          : [order.problem, [order.brand, order.model].filter(Boolean).join(' ')].filter(Boolean).join(' • ');
                        return (
                          <button
                            key={`${order.type || 'repair'}-${order.id}`}
                            type='button'
                            onClick={() => openOrder(order)}
                            className='w-full text-left p-3 rounded-xl border border-border bg-surface hover:bg-bg transition'
                          >
                            <div className='flex items-start justify-between gap-3'>
                              <div className='min-w-0'>
                                <div className='font-medium'>{title}</div>
                                {subtitle && (
                                  <div className='text-sm text-muted mt-1 truncate' title={subtitle}>
                                    {subtitle}
                                  </div>
                                )}
                                <div className='text-xs text-muted mt-1'>
                                  {new Date(order.createdAt).toLocaleString('ru-RU')}
                                </div>
                              </div>
                              <div className='text-right shrink-0'>
                                <div className={`text-xs px-2 py-1 rounded ${getStatusColor(order.status)}`}>
                                  {order.status}
                                </div>
                                <div className='font-medium mt-2 whitespace-nowrap'>
                                  {(order.price || 0).toLocaleString('ru-RU')} ₽
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className='text-xs text-muted mt-2'>Нажмите на заказ, чтобы открыть полную карточку</p>
                </div>
              </div>
            )}
          </div>

          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-8 pt-6 border-t border-border'>
            {isEdit && client && onDelete ? (
              <button
                type='button'
                className='btn secondary text-danger border-danger sm:mr-auto w-full sm:w-auto'
                onClick={() => onDelete(client.id, client.name)}
                disabled={loading}
              >
                Удалить клиента
              </button>
            ) : (
              <span />
            )}
            <div className='grid grid-cols-2 gap-3 w-full sm:w-auto'>
            <button className='btn secondary w-full' onClick={onClose} disabled={loading}>
              Отмена
            </button>
            <button
              className='btn'
              onClick={handleSubmit}
              disabled={loading || !form.name || !form.phone}
            >
              {loading ? (
                <>
                  <div className='inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2'></div>
                  Сохранение...
                </>
              ) : isEdit ? 'Сохранить изменения' : 'Создать клиента'}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientDetailsModal({ 
  client, 
  onClose,
  onDelete,
  formatPhone,
  getStatusColor
}: { 
  client: any; 
  onClose: () => void;
  onDelete?: (id: number, name?: string) => void;
  formatPhone: (phone: string) => string;
  getStatusColor: (status: string) => string;
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'info' | 'orders'>('info');

  return (
    <div className='modal-overlay'>
      <div className='card w-full max-w-3xl max-h-[90vh] overflow-hidden'>
        <div className='card-inner overflow-y-auto'>
          <div className='flex flex-wrap justify-between items-start gap-3 mb-6'>
            <div className='min-w-0'>
              <h2 className='modal-title'>{client.name}</h2>
              <p className='text-sm text-muted mt-1'>Детальная информация о клиенте</p>
            </div>
            <button onClick={onClose} className='btn secondary'>Закрыть</button>
          </div>

          <div className='tabs mb-6'>
            <button
              className={`tab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              Информация
            </button>
            <button
              className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              Заказы ({client.orders?.length || 0})
            </button>
          </div>

          {activeTab === 'info' ? (
            <div className='space-y-6'>
              {/* Основная информация */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div className='space-y-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted mb-2'>Контактная информация</h3>
                    <div className='space-y-2'>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium'>{formatPhone(client.phone)}</span>
                      </div>
                      {client.email && (
                        <div className='flex items-center gap-2'>
                          <span>{client.email}</span>
                        </div>
                      )}
                      {(client.telegram || client.whatsapp || client.vk) && (
                        <div className='flex flex-wrap gap-4 mt-3'>
                          {client.telegram && (
                            <div className='flex items-center gap-2'>
                              <span className='text-muted'>Telegram</span>
                              <span className='text-sm bg-bg border border-border px-2 py-1 rounded'>{client.telegram}</span>
                            </div>
                          )}
                          {client.whatsapp && (
                            <div className='flex items-center gap-2'>
                              <span className='text-muted'>WhatsApp</span>
                              <span className='text-sm bg-bg border border-border px-2 py-1 rounded'>{client.whatsapp}</span>
                            </div>
                          )}
                          {client.vk && (
                            <div className='flex items-center gap-2'>
                              <span className='text-muted'>ВКонтакте</span>
                              <span className='text-sm bg-bg border border-border px-2 py-1 rounded'>{client.vk}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {client.notes && (
                    <div>
                      <h3 className='text-sm font-medium text-muted mb-2'>Заметки</h3>
                      <div className='p-3 bg-surface rounded-xl'>
                        <p className='text-sm whitespace-pre-wrap'>{client.notes}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className='space-y-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted mb-2'>Статистика</h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='p-3 bg-surface rounded-xl text-center'>
                        <div className='text-2xl font-bold text-primary'>{client.totalOrders}</div>
                        <div className='text-xs text-muted mt-1'>Всего заказов</div>
                      </div>
                      <div className='p-3 bg-surface rounded-xl text-center'>
                        <div className='text-2xl font-bold text-text'>
                          {(client.totalSpent || 0).toLocaleString('ru-RU')} ₽
                        </div>
                        <div className='text-xs text-muted mt-1'>Общая выручка</div>
                      </div>
                      <div className='p-3 bg-surface rounded-xl text-center'>
                        <div className='text-2xl font-bold text-text'>
                          {client.avgOrderValue ? Math.round(client.avgOrderValue).toLocaleString('ru-RU') : 0} ₽
                        </div>
                        <div className='text-xs text-muted mt-1'>Средний чек</div>
                      </div>
                      <div className='p-3 bg-surface rounded-xl text-center'>
                        <div className='text-2xl font-bold text-text'>
                          {client.activeOrders?.length || 0}
                        </div>
                        <div className='text-xs text-muted mt-1'>Активных заказов</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className='text-sm font-medium text-muted mb-2'>Даты</h3>
                    <div className='space-y-2'>
                      <div className='flex justify-between'>
                        <span className='text-sm text-muted'>Создан:</span>
                        <span>{new Date(client.createdAt).toLocaleString('ru-RU')}</span>
                      </div>
                      <div className='flex justify-between'>
                        <span className='text-sm text-muted'>Обновлен:</span>
                        <span>{new Date(client.updatedAt).toLocaleString('ru-RU')}</span>
                      </div>
                      <div className='flex justify-between'>
                        <span className='text-sm text-muted'>Последний заказ:</span>
                        <span>
                          {client.lastOrderDate 
                            ? new Date(client.lastOrderDate).toLocaleString('ru-RU')
                            : 'Нет заказов'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className='space-y-4'>
              <h3 className='text-sm font-medium text-muted mb-2'>История заказов</h3>
              {client.orders?.length ? (
                <div className='space-y-2 max-h-[50vh] overflow-y-auto pr-1'>
                  {client.orders.map((order: any) => (
                    <button
                      key={`${order.type || 'repair'}-${order.id}`}
                      type='button'
                      onClick={() => {
                        if (order.type === 'shop') {
                          navigate('/shop');
                        } else {
                          navigate(`/orders?open=${order.id}`);
                        }
                        onClose();
                      }}
                      className='w-full text-left p-3 bg-surface rounded-xl hover:bg-bg border border-transparent hover:border-border transition'
                    >
                      <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3'>
                        <div className='min-w-0'>
                          <div className='font-medium'>Заказ #{order.id}</div>
                          <div className='text-sm text-muted mt-1'>{order.problem}</div>
                          <div className='text-xs text-muted mt-2'>
                            {order.brand} {order.model}
                          </div>
                        </div>
                        <div className='sm:text-right shrink-0'>
                          <div className={`text-xs px-2 py-1 rounded ${getStatusColor(order.status)}`}>
                            {order.status}
                          </div>
                          <div className='font-medium mt-2'>{order.price?.toLocaleString('ru-RU')} ₽</div>
                          <div className='text-xs text-muted mt-1'>
                            {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className='text-center py-8 text-muted'>
                  <p>Нет заказов</p>
                </div>
              )}
            </div>
          )}

          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-8 pt-6 border-t border-border'>
            {onDelete ? (
              <button
                type='button'
                className='btn secondary text-danger border-danger w-full sm:w-auto'
                onClick={() => onDelete(client.id, client.name)}
              >
                Удалить клиента
              </button>
            ) : (
              <span />
            )}
            <button className='btn secondary w-full sm:w-auto' onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}