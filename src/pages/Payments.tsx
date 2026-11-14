import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import Select from '../components/Select'
import CashRegisterSelect from '../components/CashRegisterSelect'
import { notifyBalanceChanged } from '../utils/balanceEvents'
import { useAuth } from '../auth'
import { useCashRegisters } from '../hooks/useCashRegisters'

type Tx = { 
  id: number; 
  type: 'Приход' | 'Расход'; 
  method: string;
  methodId?: string;
  sum: number; 
  comment?: string; 
  createdAt: string;
  category?: string;
  categoryIcon?: string;
  categoryId?: number | null;
  cashRegisterId?: number | null;
  cashRegisterName?: string | null;
}

type Category = {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color?: string;
  icon?: string;
}

type PaymentMethod = {
  id: string;
  name: string;
  icon: string;
}



export default function Payments(){
  const auth = useAuth()
  const canManageFinance = ['owner', 'admin', 'director'].includes(auth.user?.role || '')
  const [rows, setRows] = useState<Tx[]>([])
  const [balance, setBalance] = useState(0)
  const [open, setOpen] = useState<null | ('Приход' | 'Расход')>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<Tx | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [filterQ, setFilterQ] = useState('')
  const [filterRegister, setFilterRegister] = useState<number | ''>('')
  
  // Данные для формы
  const [modalSum, setModalSum] = useState('')
  const [modalCost, setModalCost] = useState('')
  const [modalComment, setModalComment] = useState('')
  const [modalCategory, setModalCategory] = useState<string>('')
  const [modalMethod, setModalMethod] = useState<string>('card')
  const [modalRegister, setModalRegister] = useState<number | ''>('')
  const [transferFrom, setTransferFrom] = useState<number | ''>('')
  const [transferTo, setTransferTo] = useState<number | ''>('')
  const [transferSum, setTransferSum] = useState('')
  const [transferComment, setTransferComment] = useState('')
  const [transferSaving, setTransferSaving] = useState(false)
  const { registers, defaultId: defaultRegisterId, reload: reloadRegisters } = useCashRegisters()
  
  // Данные для выпадающих списков
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  useEffect(() => {
    if (!modalRegister && defaultRegisterId) setModalRegister(defaultRegisterId)
  }, [defaultRegisterId, modalRegister])

  useEffect(() => {
    if (!transferOpen) return
    const active = registers.filter((r) => r.isActive !== false)
    if (!transferFrom && active[0]) setTransferFrom(active[0].id)
    if (!transferTo && active.length > 1) {
      const other = active.find((r) => r.id !== (transferFrom || active[0]?.id))
      if (other) setTransferTo(other.id)
    }
  }, [transferOpen, registers, transferFrom, transferTo])

  useEffect(() => {
    loadPayments();
    loadBalance();
    loadCategories();
    loadPaymentMethods();
  }, [filterType, filterMethod, filterQ, filterRegister])

  async function loadPayments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterMethod) params.set('method', filterMethod);
      if (filterQ.trim()) params.set('q', filterQ.trim());
      if (filterRegister) params.set('cashRegisterId', String(filterRegister));
      const qs = params.toString();
      const response = await apiFetch(`/payments${qs ? `?${qs}` : ''}`);
      const data = await response.json();
      setRows(data.payments || []);
    } catch (error) {
      console.error('Ошибка загрузки платежей:', error);
    } finally {
      setLoading(false);
    }
  }

async function loadBalance() {
  try {
    const query = filterRegister ? `?cashRegisterId=${filterRegister}` : ''
    const response = await apiFetch(`/payments/balance${query}`);
    if (!response.ok) {
      throw new Error(`Ошибка ${response.status}`);
    }
    const data = await response.json();
    
    if (data && typeof data.balance === 'number') {
      setBalance(data.balance);
    } else {
      console.error('Некорректный формат баланса:', data);
      setBalance(0);
    }
  } catch (error) {
    console.error('Ошибка загрузки баланса:', error);
    if (filterRegister) {
      setBalance(0)
      return
    }
    // Если не работает /api/payments/balance, используем /api/payments/stats
    try {
      const statsResponse = await apiFetch('/payments/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setBalance(statsData.balance || 0);
      } else {
        setBalance(0);
      }
    } catch (statsError) {
      console.error('Ошибка загрузки статистики:', statsError);
      setBalance(0);
    }
  }
}

  async function loadCategories() {
    try {
      const response = await apiFetch('/categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
    }
  }

  async function loadPaymentMethods() {
    try {
      const response = await apiFetch('/payment-methods');
      const data = await response.json();
      setPaymentMethods(data);
    } catch (error) {
      console.error('Ошибка загрузки методов оплаты:', error);
    }
  }
async function deletePayment(id: number) {
  if (!canManageFinance) return alert('Недостаточно прав');
  if (!confirm('Удалить платеж?')) return;
  
  try {
    const response = await apiFetch(`/payments/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as any)?.error || 'Ошибка удаления платежа');
    }

    setRows(prev => prev.filter(p => p.id !== id));
    await loadBalance();
    notifyBalanceChanged();
  } catch (error: any) {
    alert(error?.message || 'Ошибка при удалении платежа');
  }
}

async function updatePayment() {
  if (!editing || !canManageFinance) return;
  const amount = parseFloat(modalSum);
  if (!Number.isFinite(amount) || amount <= 0) return alert('Введите корректную сумму');

  try {
    const response = await apiFetch(`/payments/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        type: editing.type,
        description: modalComment || editing.type,
        categoryId: modalCategory || undefined,
        method: modalMethod || 'card',
        cashRegisterId: modalRegister || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Ошибка обновления');

    setRows((prev) => prev.map((p) => (p.id === editing.id ? data : p)));
    await loadBalance();
    notifyBalanceChanged();
    setEditing(null);
    handleModalClose();
  } catch (error: any) {
    alert(error?.message || 'Ошибка при обновлении платежа');
  }
}

function openEdit(row: Tx) {
  setEditing(row);
  setModalSum(String(row.sum));
  setModalComment(row.comment || '');
  setModalCategory(row.categoryId ? String(row.categoryId) : '');
  setModalMethod(row.methodId || paymentMethods.find((m) => m.name === row.method)?.id || 'card');
  setModalRegister(row.cashRegisterId || defaultRegisterId || '');
  setModalCost('');
}
async function addTx(
  type: 'Приход' | 'Расход', 
  sum: number, 
  categoryId?: string, 
  method?: string, 
  comment?: string,
  cost = 0,
  cashRegisterId?: number | ''
) {
  try {
    const methodObj = paymentMethods.find(m => m.id === method);
    const methodName = methodObj ? `${methodObj.name}` : 'Карта';
    const description = comment || type;
    
    const response = await apiFetch('/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: sum,
        type: type,
        description,
        categoryId: categoryId || undefined,
        method: method || 'card',
        cashRegisterId: cashRegisterId || undefined,
      })
    });

    if (!response.ok) {
      throw new Error(`Ошибка создания платежа: ${response.status}`);
    }

    const newPayment = await response.json();

    if (type === 'Приход' && cost > 0) {
      const costResponse = await apiFetch('/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cost,
          type: 'Расход',
          description: `Себестоимость: ${description}`,
          cashRegisterId: cashRegisterId || undefined,
        })
      })
      if (!costResponse.ok) {
        throw new Error('Ошибка создания расхода по себестоимости');
      }
    }
    
    setRows(prev => [{
      ...newPayment,
      method: methodName
    }, ...prev]);
    
    await loadBalance();
    await loadPayments();
    notifyBalanceChanged();
    
    handleModalClose();
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    alert('Ошибка при создании платежа. Проверьте консоль.');
  }
}

  const handleModalSave = () => {
    if (editing) {
      updatePayment();
      return;
    }
    if (!open) return;
    
    const amount = parseFloat(modalSum);
    if (!isNaN(amount) && amount > 0) {
      const cost = open === 'Приход' ? Math.max(0, parseFloat(modalCost) || 0) : 0
      addTx(open, amount, modalCategory, modalMethod, modalComment, cost, modalRegister);
    } else {
      alert('Введите корректную сумму');
    }
  };

  const handleModalClose = () => {
    setOpen(null);
    setEditing(null);
    setModalSum('');
    setModalCost('');
    setModalComment('');
    setModalCategory('');
    setModalMethod('card');
    setModalRegister(defaultRegisterId || '');
  };

  const filteredCategories = categories.filter(cat => {
    const type = editing?.type || open;
    return type
      ? (type === 'Приход' && cat.type === 'income') || (type === 'Расход' && cat.type === 'expense')
      : false;
  });

  // Получаем название метода без иконки
  const getMethodName = (methodString: string) => {
    if (!methodString) return 'Карта';
    return methodString.replace(/[^\w\s]/g, '').trim();
  };

  return (
    <div className='space-y-6'>
      {/* Заголовок и кнопки */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold'>Платежи</h1>
          <div className='mt-2 text-lg font-semibold'>
            {filterRegister
              ? `Баланс «${registers.find((row) => row.id === filterRegister)?.name || 'касса'}»:`
              : 'Баланс всех касс:'}{' '}
            <span className='text-primary'>{balance.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>
        <div className='grid grid-cols-2 sm:flex gap-2 sm:gap-3 w-full sm:w-auto'>
          {canManageFinance && (
            <>
              <button 
                className='btn secondary flex items-center gap-2'
                onClick={() => setOpen('Приход')}
              >
                <span>Приход</span>
              </button>
              <button 
                className='btn secondary flex items-center gap-2'
                onClick={() => setOpen('Расход')}
              >
                <span>Расход</span>
              </button>
              {registers.filter((r) => r.isActive !== false).length >= 2 ? (
                <button
                  className='btn secondary flex items-center gap-2 col-span-2 sm:col-span-1'
                  onClick={() => setTransferOpen(true)}
                >
                  <span>Перевод</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className='card'>
        <div className='card-inner'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-3'>
            <div>
              <label className='label text-xs'>Тип</label>
              <Select className='select' value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value=''>Все</option>
                <option value='Приход'>Приход</option>
                <option value='Расход'>Расход</option>
              </Select>
            </div>
            <div>
              <label className='label text-xs'>Метод</label>
              <Select className='select' value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
                <option value=''>Все</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
            <CashRegisterSelect
              value={filterRegister}
              onChange={setFilterRegister}
              label='Касса'
              allowEmpty
              showBalance
            />
            <div>
              <label className='label text-xs'>Поиск по комментарию</label>
              <input className='input' value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder='Текст операции…' />
            </div>
          </div>
        </div>
      </div>

      {/* Таблица платежей */}
      <div className='card overflow-hidden'>
        <div className='p-4 border-b border-border bg-surface/50'>
          <h2 className='text-lg font-semibold'>История операций</h2>
        </div>
        
        {loading ? (
          <div className='py-12 text-center text-muted'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
            <p className='mt-2'>Загрузка...</p>
          </div>
        ) : (
          <div className='overflow-auto'>
            <table className='w-full min-w-[780px] table-auto text-sm'>
              <thead>
                <tr>
                  <th className='w-[10%] text-left py-3 px-3'>Тип</th>
                  <th className='w-[18%] text-left py-3 px-3'>Категория</th>
                  <th className='w-[12%] text-left py-3 px-3'>Метод</th>
                  <th className='w-[12%] text-left py-3 px-3'>Сумма, ₽</th>
                  <th className='w-[32%] text-left py-3 px-3'>Комментарий</th>
                  <th className='w-[14%] text-left py-3 px-3'>Дата</th>
                  {canManageFinance && <th className='w-[10%] text-left py-3 px-3'></th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canManageFinance ? 7 : 6} className='py-12 text-center text-muted'>
                      <p className='text-lg font-medium'>Здесь пока пусто</p>
                      <p className='text-sm mt-1'>Создайте первый платеж</p>
                    </td>
                  </tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.id} className='hover:bg-surface/30 transition-colors'>
                      <td className='py-3 px-3 border-t border-border'>
                        <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-border bg-surface/30 text-text'>
                          {r.type}
                        </span>
                      </td>
                      <td className='py-3 px-3 border-t border-border text-muted'>
                        <div className='flex items-center gap-2'>
                          <span>{r.category || 'Не указана'}</span>
                        </div>
                      </td>
                      <td className='py-3 px-3 border-t border-border'>
                        <div className='flex items-center gap-2'>
                          <span>{getMethodName(r.method)}</span>
                        </div>
                      </td>
                      <td className='py-3 px-3 border-t border-border font-medium whitespace-nowrap'>
                        {r.type === 'Расход' ? '-' : '+'}{r.sum.toLocaleString('ru-RU')} ₽
                      </td>
                      <td className='py-3 px-3 border-t border-border break-words'>
                        {r.comment || '—'}
                      </td>
                      <td className='py-3 px-3 border-t border-border text-muted whitespace-nowrap'>
                        {new Date(r.createdAt).toLocaleString('ru-RU')}
                      </td>
                      {canManageFinance && (
                        <td className='py-3 px-3 border-t border-border whitespace-nowrap'>
                          <div className='flex gap-1'>
                            <button className='btn ghost text-xs px-2 py-1' onClick={() => openEdit(r)}>Изм.</button>
                            <button className='btn ghost text-xs px-2 py-1 text-danger' onClick={() => deletePayment(r.id)}>Удал.</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {transferOpen && (
        <div className='modal-overlay'>
          <div className='card w-full max-w-md'>
            <div className='card-inner space-y-4'>
              <div className='flex justify-between items-center'>
                <div>
                  <h2 className='modal-title'>Перевод между кассами</h2>
                  <p className='text-sm text-muted mt-1'>Списание с одной кассы и зачисление на другую</p>
                </div>
                <button
                  onClick={() => setTransferOpen(false)}
                  className='w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface/50 transition'
                >
                  ✕
                </button>
              </div>
              <CashRegisterSelect
                value={transferFrom}
                onChange={setTransferFrom}
                label='Откуда'
                showBalance
              />
              <CashRegisterSelect
                value={transferTo}
                onChange={setTransferTo}
                label='Куда'
                showBalance
              />
              <div>
                <label className='label'>Сумма, ₽ *</label>
                <input
                  type='number'
                  className='input'
                  min={0}
                  step='0.01'
                  value={transferSum}
                  onChange={(e) => setTransferSum(e.target.value)}
                  placeholder='0'
                />
              </div>
              <div>
                <label className='label'>Комментарий</label>
                <input
                  className='input'
                  value={transferComment}
                  onChange={(e) => setTransferComment(e.target.value)}
                  placeholder='Необязательно'
                />
              </div>
              <div className='flex gap-3 pt-2'>
                <button className='btn secondary flex-1' onClick={() => setTransferOpen(false)}>
                  Отмена
                </button>
                <button
                  className='btn flex-1'
                  disabled={transferSaving || !transferSum || parseFloat(transferSum) <= 0}
                  onClick={async () => {
                    const amount = parseFloat(transferSum)
                    if (!transferFrom || !transferTo) return alert('Выберите кассы')
                    if (transferFrom === transferTo) return alert('Кассы должны отличаться')
                    if (!Number.isFinite(amount) || amount <= 0) return alert('Укажите сумму')
                    setTransferSaving(true)
                    try {
                      const res = await apiFetch('/cash-registers/transfer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fromId: transferFrom,
                          toId: transferTo,
                          amount,
                          comment: transferComment.trim() || undefined,
                        }),
                      })
                      const data = await res.json().catch(() => null)
                      if (!res.ok) throw new Error(data?.error || 'Ошибка перевода')
                      setTransferOpen(false)
                      setTransferSum('')
                      setTransferComment('')
                      await Promise.all([loadPayments(), loadBalance(), reloadRegisters()])
                      notifyBalanceChanged()
                    } catch (e: any) {
                      alert(e?.message || 'Не удалось перевести')
                    } finally {
                      setTransferSaving(false)
                    }
                  }}
                >
                  {transferSaving ? 'Перевод…' : 'Перевести'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для создания/редактирования платежа */}
      {(open || editing) && (
        <div className='modal-overlay'>
          <div className='card w-full max-w-md'>
            <div className='card-inner'>
              <div className='flex justify-between items-center mb-6'>
                <div>
                  <h2 className='modal-title'>{editing ? 'Редактирование' : open}</h2>
                  <p className='text-sm text-muted mt-1'>{editing ? 'Изменение операции' : 'Создание новой операции'}</p>
                </div>
                <button 
                  onClick={handleModalClose} 
                  className='w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface/50 transition'
                >
                  ✕
                </button>
              </div>
              
              {/* Форма */}
              <div className='space-y-5'>
                {/* Сумма */}
                <div>
                  <label className='label'>Сумма, ₽ *</label>
                  <div className='relative'>
                    <input 
                      type='number'
                      className='input text-lg font-medium pr-12'
                      placeholder='0'
                      value={modalSum}
                      onChange={(e) => setModalSum(e.target.value)}
                      autoFocus
                      min="0"
                      step="0.01"
                    />
                    <div className='absolute right-4 top-1/2 transform -translate-y-1/2 text-muted'>
                      ₽
                    </div>
                  </div>
                </div>

                {open === 'Приход' && !editing && (
                  <div>
                    <label className='label'>Себестоимость / расходы, ₽</label>
                    <input
                      type='number'
                      className='input'
                      placeholder='0'
                      value={modalCost}
                      onChange={(e) => setModalCost(e.target.value)}
                      min={0}
                      step='0.01'
                    />
                    <p className='text-xs text-muted mt-1'>Необязательно. Создаст отдельный расход для расчёта чистой прибыли</p>
                  </div>
                )}
                
                {/* Категория */}
                <div>
                  <label className='label'>Категория</label>
                  <Select 
                    className='select'
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                  >
                    <option value="">Выберите категорию</option>
                    {filteredCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                  <p className='text-xs text-muted mt-1'>Необязательно</p>
                </div>
                
                {/* Метод оплаты */}
                <div>
                  <label className='label'>Метод оплаты</label>
                  <div className='grid grid-cols-2 gap-2'>
                    {paymentMethods.map(method => (
                      <button
                        key={method.id}
                        type='button'
                        className={`flex items-center gap-2 p-3 rounded-xl border transition ${modalMethod === method.id ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-surface/50'}`}
                        onClick={() => setModalMethod(method.id)}
                      >
                        <span>{method.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <CashRegisterSelect
                  value={modalRegister}
                  onChange={setModalRegister}
                  label={open === 'Расход' || editing?.type === 'Расход' ? 'Касса списания' : 'Касса зачисления'}
                  showBalance
                />
                
                {/* Комментарий */}
                <div>
                  <label className='label'>Комментарий</label>
                  <textarea 
                    className='textarea'
                    placeholder='На что получен доход / на что потрачено'
                    value={modalComment}
                    onChange={(e) => setModalComment(e.target.value)}
                    rows={3}
                  />
                  <p className='text-xs text-muted mt-1'>Необязательно</p>
                </div>
                
                {/* Итог */}
                <div className='p-4 bg-surface/50 rounded-xl space-y-2'>
                  <div className='flex justify-between items-center'>
                    <span className='text-muted'>Сумма операции:</span>
                    <span className='text-lg font-semibold'>
                      {modalSum ? `${parseFloat(modalSum).toLocaleString('ru-RU')} ₽` : '0 ₽'}
                    </span>
                  </div>
                  {open === 'Приход' && parseFloat(modalCost) > 0 && (
                    <>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted'>Себестоимость:</span>
                        <span>{parseFloat(modalCost).toLocaleString('ru-RU')} ₽</span>
                      </div>
                      <div className='flex justify-between items-center pt-2 border-t border-border'>
                        <span className='font-medium'>Чистая прибыль:</span>
                        <span className={`font-bold ${parseFloat(modalSum) - parseFloat(modalCost) >= 0 ? 'text-success' : 'text-danger'}`}>
                          {(parseFloat(modalSum) - parseFloat(modalCost)).toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                    </>
                  )}
                  <div className='flex justify-between items-center'>
                    <span className='text-muted'>Новый баланс:</span>
                    <span className={`text-lg font-bold ${open === 'Приход' ? 'text-success' : 'text-danger'}`}>
                      {modalSum ? 
                        `${(balance + (open === 'Приход' ? parseFloat(modalSum) - (parseFloat(modalCost) || 0) : -parseFloat(modalSum))).toLocaleString('ru-RU')} ₽` 
                        : `${balance.toLocaleString('ru-RU')} ₽`
                      }
                    </span>
                  </div>
                </div>
                
                {/* Кнопки */}
                <div className='flex gap-3 pt-2'>
                  <button 
                    className='btn secondary flex-1'
                    onClick={handleModalClose}
                  >
                    Отмена
                  </button>
                  <button 
                    className='btn flex-1'
                    onClick={handleModalSave}
                    disabled={!modalSum || parseFloat(modalSum) <= 0}
                  >
                    {editing ? 'Сохранить изменения' : `Сохранить ${open?.toLowerCase() || ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}