import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import Select from '../components/Select'

type Task = {
  id?: number;
  title: string;
  description?: string;
  type: string;
  priority: string;
  status: string;
  orderId?: number;
  orderClient?: string;
  orderPhone?: string;
  assignedTo: string;
  dueDate?: string;
  reminderTime?: string;
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
  result?: string; // Результат выполнения задачи
  notes?: string;  // Заметки по задаче
}

type Order = {
  id: number;
  client: string;
  phone: string;
  status: string;
}



export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  // Загрузка данных
  useEffect(() => {
    loadTasks();
    loadStats();
    loadOrders();
  }, [])

  async function loadTasks() {
    try {
      setLoading(true);
      let url = `/tasks`;
      const params = new URLSearchParams();
      
      if (selectedFilter !== 'all') {
        if (selectedFilter === 'today') {
          params.append('dueDate', 'today');
        } else if (selectedFilter === 'overdue') {
          params.append('dueDate', 'overdue');
        } else if (selectedFilter === 'high') {
          params.append('priority', 'high');
        } else if (selectedFilter === 'completed') {
          params.append('isCompleted', 'true');
        } else {
          params.append('status', selectedFilter);
        }
      }
      
      if (search) {
        params.append('title', search);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await apiFetch(url);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await apiFetch('/tasks/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики задач:', error);
    }
  }

  async function loadOrders() {
    try {
      const response = await apiFetch('/orders?limit=100');
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    }
  }

  async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const response = await apiFetch('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка создания задачи');
      }

      const newTask = await response.json();
      setTasks(prev => [newTask, ...prev]);
      loadStats();
      return newTask;
    } catch (error: any) {
      console.error('Ошибка создания задачи:', error);
      throw error;
    }
  }

  async function updateTask(id: number, updates: Partial<Task>) {
    try {
      const response = await apiFetch(`/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка обновления задачи');
      }

      const updatedTask = await response.json();
      setTasks(prev => prev.map(task => 
        task.id === id ? updatedTask : task
      ));
      loadStats();
      return updatedTask;
    } catch (error: any) {
      console.error('Ошибка обновления задачи:', error);
      throw error;
    }
  }

  async function deleteTask(id: number) {
    if (!confirm('Удалить задачу?')) return;
    
    try {
      const response = await apiFetch(`/tasks/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setTasks(prev => prev.filter(task => task.id !== id));
        loadStats();
      }
    } catch (error) {
      console.error('Ошибка удаления задачи:', error);
      alert('Ошибка удаления задачи');
    }
  }

const updateTaskStatus = async (task: Task, newStatus: string) => {
  try {
    const updates: Partial<Task> = { status: newStatus };
    
    if (newStatus === 'completed') {
      updates.isCompleted = true;
    } else if (task.status === 'completed' && newStatus !== 'completed') {
      updates.isCompleted = false;
      updates.completedAt = undefined;
    }
    
    await updateTask(task.id!, updates);
    loadTasks(); // Перезагружаем задачи после обновления
  } catch (error: any) {
    alert(error.message || 'Ошибка обновления задачи');
  }
};

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setOpen(true);
  };

  const handleQuickAction = (type: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    const quickTasks: Record<string, Partial<Task>> = {
      call: {
        title: 'Позвонить клиенту',
        type: 'call',
        priority: 'high',
        status: 'new',
        dueDate: today,
        description: 'Позвонить клиенту для уточнения деталей'
      },
      parts: {
        title: 'Заказать запчасти',
        type: 'parts',
        priority: 'medium',
        status: 'new',
        dueDate: today,
        description: 'Заказать необходимые запчасти для ремонта'
      },
      reminder: {
        title: 'Напоминание на сегодня',
        type: 'reminder',
        priority: 'low',
        status: 'new',
        dueDate: today,
        description: 'Важное напоминание'
      },
      meeting: {
        title: 'Встреча с клиентом',
        type: 'meeting',
        priority: 'medium',
        status: 'new',
        dueDate: today,
        description: 'Встреча для приёмки/сдачи техники'
      },
      diagnosis: {
        title: 'Диагностика устройства',
        type: 'general',
        priority: 'high',
        status: 'new',
        dueDate: today,
        description: 'Провести диагностику устройства клиента'
      }
    };
    
    if (quickTasks[type]) {
      setEditingTask(null);
      const quickTask = quickTasks[type];
setForm({ 
  ...form, 
  ...quickTask,
  orderId: quickTask.orderId ? String(quickTask.orderId) : '' // Преобразуем number в string если нужно
});
      setOpen(true);
    }
  };

  const filterOptions = [
    { id: 'all', label: 'Все задачи' },
    { id: 'new', label: 'Новые' },
    { id: 'in_progress', label: 'В работе' },
    { id: 'today', label: 'На сегодня' },
    { id: 'overdue', label: 'Просроченные' },
    { id: 'high', label: 'Высокий приоритет' },
    { id: 'completed', label: 'Выполненные' }
  ];

  const taskTypes = [
    { id: 'general', label: 'Общая', icon: '' },
    { id: 'order', label: 'По заказу', icon: '' },
    { id: 'call', label: 'Звонок', icon: '' },
    { id: 'parts', label: 'Запчасти', icon: '' },
    { id: 'meeting', label: 'Встреча', icon: '' },
    { id: 'reminder', label: 'Напоминание', icon: '' },
    { id: 'diagnosis', label: 'Диагностика', icon: '' },
    { id: 'delivery', label: 'Доставка', icon: '' }
  ];

  const priorities = [
    { id: 'low', label: 'Низкий', color: '' },
    { id: 'medium', label: 'Средний', color: '' },
    { id: 'high', label: 'Высокий', color: '' }
  ];

  // Улучшенная система статусов для разных типов задач
  const getStatusOptions = (taskType: string) => {
    const neutral = 'bg-bg text-text border border-border';
    const baseStatuses = [
      { id: 'new', label: 'Новая', color: neutral, icon: '' },
      { id: 'in_progress', label: 'В работе', color: neutral, icon: '' },
      { id: 'completed', label: 'Выполнена', color: neutral, icon: '' },
      { id: 'cancelled', label: 'Отменена', color: neutral, icon: '' }
    ];

    const typeSpecificStatuses: Record<string, any[]> = {
      call: [
        { id: 'not_answered', label: 'Не дозвонился', color: neutral, icon: '' },
        { id: 'callback_later', label: 'Перезвонить позже', color: neutral, icon: '' },
        { id: 'client_answered', label: 'Клиент ответил', color: neutral, icon: '' },
        { id: 'info_sent', label: 'Инфо отправлено', color: neutral, icon: '' }
      ],
      parts: [
        { id: 'ordered', label: 'Заказано', color: neutral, icon: '' },
        { id: 'shipped', label: 'Отправлено', color: neutral, icon: '' },
        { id: 'delivered', label: 'Доставлено', color: neutral, icon: '' },
        { id: 'installed', label: 'Установлено', color: neutral, icon: '' }
      ],
      meeting: [
        { id: 'scheduled', label: 'Назначена', color: neutral, icon: '' },
        { id: 'confirmed', label: 'Подтверждена', color: neutral, icon: '' },
        { id: 'in_progress', label: 'Идёт встреча', color: neutral, icon: '' },
        { id: 'device_received', label: 'Техника принята', color: neutral, icon: '' },
        { id: 'device_returned', label: 'Техника сдана', color: neutral, icon: '' }
      ],
      delivery: [
        { id: 'preparing', label: 'Готовится', color: neutral, icon: '' },
        { id: 'courier_assigned', label: 'Курьер назначен', color: neutral, icon: '' },
        { id: 'on_the_way', label: 'В пути', color: neutral, icon: '' },
        { id: 'delivered', label: 'Доставлено', color: neutral, icon: '' },
        { id: 'returned', label: 'Возврат', color: neutral, icon: '' }
      ],
      diagnosis: [
        { id: 'device_received', label: 'Устройство принято', color: neutral, icon: '' },
        { id: 'diagnosing', label: 'Диагностируется', color: neutral, icon: '' },
        { id: 'diagnosed', label: 'Диагностика завершена', color: neutral, icon: '' },
        { id: 'waiting_approval', label: 'Ждём согласия', color: neutral, icon: '' },
        { id: 'approved', label: 'Согласовано', color: neutral, icon: '' }
      ]
    };

    return [...baseStatuses, ...(typeSpecificStatuses[taskType] || [])];
  };

  const assignees = [
    { id: 'admin', name: 'Администратор' },
    { id: 'tech1', name: 'Техник 1' },
    { id: 'tech2', name: 'Техник 2' },
    { id: 'manager', name: 'Менеджер' },
    { id: 'courier', name: 'Курьер' }
  ];

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Не указано';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Не указано';
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate || task.isCompleted) return false;
    const today = new Date().toISOString().split('T')[0];
    return task.dueDate < today;
  };

  // Состояние для формы (вне компонента TaskModal)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'general',
    priority: 'medium',
    status: 'new',
    orderId: '',
    assignedTo: assignees[0]?.id || '',
    dueDate: '',
    reminderTime: '',
    isCompleted: false
  });

  return (
    <div className='space-y-6'>
      {/* Заголовок и статистика */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Задачи и напоминания</h1>
          {stats && (
            <div className='flex gap-4 mt-2 text-sm flex-wrap'>
              <span className='text-muted'>Всего: <strong>{stats.totalTasks}</strong></span>
              <span className='text-muted'>Новые: <strong>{stats.newTasks}</strong></span>
              <span className='text-muted'>В работе: <strong>{stats.inProgress}</strong></span>
              <span className='text-muted'>Выполнено: <strong>{stats.completed}</strong></span>
              <span className='text-danger'>Просрочено: <strong>{stats.overdue}</strong></span>
              <span className='text-muted'>Высокий приоритет: <strong>{stats.highPriority}</strong></span>
            </div>
          )}
        </div>
        <div className='flex gap-2'>
          <button 
            className='btn secondary'
            onClick={() => setQuickActionsOpen(!quickActionsOpen)}
          >
            Быстрые действия
          </button>
          <button className='btn' onClick={() => {
            setEditingTask(null);
            setForm({
              title: '',
              description: '',
              type: 'general',
              priority: 'medium',
              status: 'new',
              orderId: '',
              assignedTo: assignees[0]?.id || '',
              dueDate: '',
              reminderTime: '',
              isCompleted: false
            });
            setOpen(true);
          }}>
            + Новая задача
          </button>
        </div>
      </div>

      {/* Быстрые действия панель */}
      {quickActionsOpen && (
        <div className='card p-4'>
          <div className='flex justify-between items-center mb-4'>
            <h3 className='font-semibold'>Быстрые действия</h3>
            <button onClick={() => setQuickActionsOpen(false)} className='btn secondary'>Закрыть</button>
          </div>
          <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
            <button 
              className='p-4 rounded-lg border border-border hover:bg-surface transition flex flex-col items-center gap-2'
              onClick={() => handleQuickAction('call')}
            >
              <span className='text-sm'>Звонок клиенту</span>
            </button>
            <button 
              className='p-4 rounded-lg border border-border hover:bg-surface transition flex flex-col items-center gap-2'
              onClick={() => handleQuickAction('parts')}
            >
              <span className='text-sm'>Заказать запчасти</span>
            </button>
            <button 
              className='p-4 rounded-lg border border-border hover:bg-surface transition flex flex-col items-center gap-2'
              onClick={() => handleQuickAction('reminder')}
            >
              <span className='text-sm'>Напоминание</span>
            </button>
            <button 
              className='p-4 rounded-lg border border-border hover:bg-surface transition flex flex-col items-center gap-2'
              onClick={() => handleQuickAction('meeting')}
            >
              <span className='text-sm'>Встреча</span>
            </button>
            <button 
              className='p-4 rounded-lg border border-border hover:bg-surface transition flex flex-col items-center gap-2'
              onClick={() => handleQuickAction('diagnosis')}
            >
              <span className='text-sm'>Диагностика</span>
            </button>
          </div>
        </div>
      )}

      {/* Фильтры и поиск */}
      <div className='card p-4'>
        <div className='flex flex-col md:flex-row gap-4'>
          <div className='flex-1'>
            <div className='flex items-center gap-2 mb-2 overflow-x-auto pb-2'>
              {filterOptions.map(filter => (
                <button
                  key={filter.id}
                  className={`tag whitespace-nowrap ${selectedFilter === filter.id ? 'tag-active' : ''}`}
                  onClick={() => {
                    setSelectedFilter(filter.id);
                    setTimeout(() => loadTasks(), 0);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className='flex items-center gap-2'>
              <input 
                placeholder='Поиск по названию задачи...'
                className='input flex-1'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && loadTasks()}
              />
              <button className='btn secondary' onClick={loadTasks}>
                Найти
              </button>
              <button className='btn ghost' onClick={() => { setSearch(''); setSelectedFilter('all'); loadTasks(); }}>
                Сбросить
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Список задач */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* Колонка: Активные задачи */}
        <div className='lg:col-span-2'>
          <div className='card overflow-hidden'>
            <div className='p-4 border-b border-border bg-surface'>
              <h2 className='text-lg font-semibold'>Активные задачи</h2>
              <p className='text-sm text-muted mt-1'>Задачи, требующие внимания</p>
            </div>
            
            {loading ? (
              <div className='py-12 text-center text-muted'>
                <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
                <p className='mt-2'>Загрузка задач...</p>
              </div>
            ) : tasks.filter(t => !t.isCompleted).length === 0 ? (
              <div className='py-12 text-center text-muted'>
                <p className='text-lg font-medium'>Все задачи выполнены!</p>
                <p className='text-sm mt-1'>Создайте новую задачу</p>
              </div>
            ) : (
              <div className='divide-y divide-border'>
                {tasks
                  .filter(task => !task.isCompleted)
                  .map(task => {
                    const statusOptions = getStatusOptions(task.type);
                    const currentStatus = statusOptions.find(s => s.id === task.status) || statusOptions[0];
                    
                    return (
                    <div key={task.id} className='p-4 hover:bg-surface transition-colors'>
                      <div className='flex items-start justify-between'>
                        <div className='flex-1'>
                          <div className='flex items-center gap-2 mb-2'>
                            <span className='text-xs px-2 py-1 rounded border border-border bg-bg text-muted'>
                              {priorities.find(p => p.id === task.priority)?.label}
                            </span>
                            <span className='text-xs px-2 py-1 rounded border border-border bg-bg text-text'>
                              {currentStatus.label}
                            </span>
                            {task.type && (
                              <span className='text-xs px-2 py-1 rounded border border-border bg-bg text-muted'>
                                {taskTypes.find(t => t.id === task.type)?.label}
                              </span>
                            )}
                            {isOverdue(task) && (
                              <span className='text-xs px-2 py-1 rounded border border-border text-danger'>
                                Просрочено
                              </span>
                            )}
                          </div>
                          
<div className='flex items-start gap-3'>
  <button
    onClick={() => updateTaskStatus(task, 'completed')}
    className={`w-6 h-6 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
      task.isCompleted ? 'bg-primary border-primary text-black' : 'border-border hover:border-primary'
    }`}
  >
    {task.isCompleted && '✓'}
  </button>
  
  <div className='flex-1'>
    <h3 className='font-medium'>{task.title}</h3>
    {task.description && (
      <p className='text-sm text-muted mt-1'>{task.description}</p>
    )}
    
    {/* Быстрое изменение статуса */}
    <div className='flex flex-wrap gap-2 mt-3'>
      {getStatusOptions(task.type)
        .filter(status => status.id !== task.status && status.id !== 'completed')
        .slice(0, 3)
        .map(status => (
          <button
            key={status.id}
            onClick={() => updateTaskStatus(task, status.id)}
            className='text-xs px-2 py-1 rounded border border-border bg-bg hover:bg-surface transition'
          >
            {status.label}
          </button>
        ))}
    </div>
                              
                              <div className='flex flex-wrap gap-3 mt-3 text-xs'>
                                {task.orderId && (
                                  <div className='flex items-center gap-1'>
                                    <span className='text-muted'>Заказ:</span>
                                    <Link to={`/orders`} className='text-primary hover:underline'>
                                      #{task.orderId} {task.orderClient && `(${task.orderClient})`}
                                    </Link>
                                  </div>
                                )}
                                
                                {task.assignedTo && (
                                  <div className='flex items-center gap-1'>
                                    <span className='text-muted'>Исполнитель:</span>
                                    <span>{assignees.find(a => a.id === task.assignedTo)?.name || task.assignedTo}</span>
                                  </div>
                                )}
                                
                                {task.dueDate && (
                                  <div className={`flex items-center gap-1 ${isOverdue(task) ? 'text-danger' : 'text-muted'}`}>
                                    <span>Срок:</span>
                                    <span>{formatDate(task.dueDate)}</span>
                                  </div>
                                )}
                                
                                <div className='flex items-center gap-1 text-muted'>
                                  <span>Создана:</span>
                                  <span>{formatDate(task.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className='flex gap-2 ml-4'>
                          <button
                            className='text-xs px-2 py-1 rounded bg-bg border border-border hover:bg-surface transition'
                            onClick={() => handleEditTask(task)}
                          >
                            Ред.
                          </button>
                          <button
                            className='text-xs px-2 py-1 rounded bg-bg border border-border text-danger hover:bg-surface transition'
                            onClick={() => deleteTask(task.id!)}
                          >
                            Удал.
                          </button>
                        </div>
                      </div>
                    </div>
                  )})}
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка: Статистика и выполненные задачи */}
        <div className='space-y-6'>
          {/* Статистика по приоритетам */}
          <div className='card'>
            <div className='p-4 border-b border-border'>
              <h3 className='font-semibold'>Приоритеты задач</h3>
            </div>
            <div className='p-4 space-y-3'>
              <div className='flex items-center justify-between'>
                <span className='text-sm'>Высокий приоритет</span>
                <span className='font-semibold'>{stats?.highPriority || 0}</span>
              </div>
              <div className='w-full bg-surface rounded-full h-2'>
                <div 
                  className='bg-primary h-2 rounded-full' 
                  style={{ width: `${((stats?.highPriority || 0) / (stats?.totalTasks || 1)) * 100}%` }}
                />
              </div>
              
              <div className='flex items-center justify-between'>
                <span className='text-sm'>Средний приоритет</span>
                <span className='font-semibold'>{stats?.mediumPriority || 0}</span>
              </div>
              <div className='w-full bg-surface rounded-full h-2'>
                <div 
                  className='bg-primary h-2 rounded-full' 
                  style={{ width: `${((stats?.mediumPriority || 0) / (stats?.totalTasks || 1)) * 100}%` }}
                />
              </div>
              
              <div className='flex items-center justify-between'>
                <span className='text-sm'>Низкий приоритет</span>
                <span className='font-semibold'>{stats?.lowPriority || 0}</span>
              </div>
              <div className='w-full bg-surface rounded-full h-2'>
                <div 
                  className='bg-primary h-2 rounded-full' 
                  style={{ width: `${((stats?.lowPriority || 0) / (stats?.totalTasks || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Выполненные задачи */}
          <div className='card overflow-hidden'>
            <div className='p-4 border-b border-border bg-surface'>
              <h3 className='font-semibold'>Недавно выполненные</h3>
            </div>
            
            {tasks.filter(t => t.isCompleted).slice(0, 5).length === 0 ? (
              <div className='p-4 text-center text-muted'>
                <p className='text-sm'>Нет выполненных задач</p>
              </div>
            ) : (
              <div className='divide-y divide-border'>
                {tasks
                  .filter(task => task.isCompleted)
                  .slice(0, 5)
                  .map(task => (
                    <div key={task.id} className='p-3'>
                      <div className='flex items-start gap-2'>
                        <div className='w-4 h-4 rounded-full bg-bg border border-border flex items-center justify-center mt-0.5 flex-shrink-0'>
                          <div className='w-2 h-2 rounded-full bg-primary'></div>
                        </div>
                        <div className='flex-1'>
                          <p className='text-sm line-through'>{task.title}</p>
                          <p className='text-xs text-muted mt-1'>
                            Выполнено: {task.completedAt ? formatDateTime(task.completedAt) : 'Не указано'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальное окно создания/редактирования задачи */}
{open && (
  <TaskModal
    onClose={() => {
      setOpen(false);
      setEditingTask(null);
    }}
    onSave={async (taskData) => {
      try {
        if (editingTask && editingTask.id) {
          // Редактируем существующую задачу
          await updateTask(editingTask.id, taskData as Partial<Task>);
          alert('Задача успешно обновлена');
        } else {
          // Создаем новую задачу
          await createTask(taskData as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>);
          alert('Задача успешно создана');
        }
        setOpen(false); // Закрываем модальное окно
        setEditingTask(null);
        loadTasks(); // Перезагружаем задачи
      } catch (error: any) {
        alert(error.message || 'Ошибка сохранения задачи');
      }
    }}
    orders={orders}
    assignees={assignees}
    taskTypes={taskTypes}
    priorities={priorities}
    statusOptions={getStatusOptions(form.type)}
    initialData={editingTask || form}
    isEditing={!!editingTask}
  />
)}
    </div>
  );
}

// Компонент модального окна создания/редактирования задачи
function TaskModal({ 
  onClose, 
  onSave,
  orders,
  assignees,
  taskTypes,
  priorities,
  statusOptions,
  initialData,
  isEditing = false
}: { 
  onClose: () => void; 
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | Partial<Task>) => void;
  orders: Order[];
  assignees: Array<{id: string, name: string}>;
  taskTypes: Array<{id: string, label: string, icon: string}>;
  priorities: Array<{id: string, label: string, color: string}>;
  statusOptions: Array<{id: string, label: string, color: string, icon: string}>;
  initialData: any;
  isEditing?: boolean;
}) {
  const [form, setForm] = useState({
    title: initialData.title || '',
    description: initialData.description || '',
    type: initialData.type || 'general',
    priority: initialData.priority || 'medium',
    status: initialData.status || 'new',
    orderId: initialData.orderId?.toString() || '',
    assignedTo: initialData.assignedTo || (assignees.length > 0 ? assignees[0].id : ''),
    dueDate: initialData.dueDate?.split('T')[0] || '',
    reminderTime: initialData.reminderTime || '',
    isCompleted: initialData.isCompleted || false,
    notes: initialData.notes || '',
    result: initialData.result || ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData.type !== form.type) {
      // При изменении типа задачи сбрасываем статус на первый доступный
      const newStatusOptions = statusOptions;
      const firstStatus = newStatusOptions[0]?.id || 'new';
      setForm(prev => ({ ...prev, status: firstStatus }));
    }
  }, [form.type]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!form.title.trim()) {
      newErrors.title = 'Название задачи обязательно';
    }
    
    if (form.type === 'order' && !form.orderId) {
      newErrors.orderId = 'Выберите заказ для привязки';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

// В функции handleSubmit компонента TaskModal:
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }
  
  setSaving(true);
  try {
    const taskData: any = {
      title: form.title,
      description: form.description,
      type: form.type,
      priority: form.priority,
      status: form.status,
      assignedTo: form.assignedTo,
      isCompleted: form.isCompleted,
    };
    
    if (form.orderId) {
      taskData.orderId = parseInt(form.orderId);
    }
    
    if (form.dueDate) {
      taskData.dueDate = form.dueDate;
    }
    
    if (form.reminderTime) {
      taskData.reminderTime = form.reminderTime;
    }
    
    // Временный комментарий пока нет колонок в БД
    // if (form.notes) {
    //   taskData.notes = form.notes;
    //   taskData.result = form.notes;
    // }
    
    await onSave(taskData);
  } catch (error: any) {
    console.error('Ошибка сохранения задачи:', error);
    alert(error.message || 'Ошибка сохранения задачи');
  } finally {
    setSaving(false);
  }
};
  const handleInputChange = (field: string, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Очищаем ошибку при изменении поля
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div
        className='card w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col bg-bg/90'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6 border-b border-border sticky top-0 bg-bg/90 z-10'>
          <div className='flex items-center justify-between'>
            <h2 className='text-xl font-bold'>
              {isEditing ? 'Редактирование задачи' : 'Новая задача'}
            </h2>
            <button
              onClick={onClose}
              className='btn secondary'
            >
              Закрыть
            </button>
          </div>
          <p className='text-muted mt-1'>
            {isEditing ? 'Измените данные задачи' : 'Создайте новую задачу или напоминание'}
          </p>
        </div>
        
        <div className='p-6'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            {/* Основная информация */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              {/* Заголовок задачи */}
              <div className='md:col-span-2'>
                <label className='block text-sm font-medium mb-2'>
                  Название задачи <span className='text-danger'>*</span>
                </label>
                <input
                  type='text'
                  className={`input w-full ${errors.title ? 'border-danger' : ''}`}
                  value={form.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder='Например: Позвонить клиенту Ивану'
                  maxLength={200}
                />
                {errors.title && (
                  <p className='text-danger text-sm mt-1'>{errors.title}</p>
                )}
              </div>
              
              {/* Описание */}
              <div className='md:col-span-2'>
                <label className='block text-sm font-medium mb-2'>
                  Описание
                </label>
                <textarea
                  className='input w-full min-h-[80px] resize-y'
                  value={form.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder='Детали задачи, важные заметки...'
                  rows={3}
                />
              </div>
              
              {/* Тип задачи */}
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Тип задачи
                </label>
                <div className='grid grid-cols-3 gap-2'>
                  {taskTypes.map(type => (
                    <button
                      key={type.id}
                      type='button'
                      className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition ${
                        form.type === type.id 
                          ? 'border-primary text-primary' 
                          : 'border-border hover:border-primary'
                      }`}
                      onClick={() => handleInputChange('type', type.id)}
                    >
                      <span className='text-xs'>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Приоритет */}
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Приоритет
                </label>
                <div className='flex flex-col gap-2'>
                  {priorities.map(priority => (
                    <button
                      key={priority.id}
                      type='button'
                      className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition ${
                        form.priority === priority.id 
                          ? 'border-primary text-primary' 
                          : 'border-border hover:border-primary'
                      }`}
                      onClick={() => handleInputChange('priority', priority.id)}
                    >
                      <span className='font-medium'>{priority.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Статус */}
              <div className='md:col-span-2'>
                <label className='block text-sm font-medium mb-2'>
                  Статус
                </label>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
                  {statusOptions.map(status => (
                    <button
                      key={status.id}
                      type='button'
                      className={`p-3 rounded-lg border flex items-center justify-center gap-2 transition ${
                        form.status === status.id 
                          ? 'border-primary text-primary' 
                          : 'border-border hover:border-primary'
                      }`}
                      onClick={() => handleInputChange('status', status.id)}
                    >
                      <span className='text-xs'>{status.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Привязать к заказу (если тип "order") */}
              {form.type === 'order' && (
                <div className='md:col-span-2'>
                  <label className='block text-sm font-medium mb-2'>
                    Привязать к заказу <span className='text-danger'>*</span>
                  </label>
                  <Select
                    className={`input w-full ${errors.orderId ? 'border-danger' : ''}`}
                    value={form.orderId}
                    onChange={(e) => handleInputChange('orderId', e.target.value)}
                  >
                    <option value=''>Выберите заказ...</option>
                    {orders
                      .filter(order => order.status !== 'Выполнен')
                      .map(order => (
                        <option key={order.id} value={order.id}>
                          #{order.id} - {order.client} ({order.status})
                        </option>
                      ))}
                  </Select>
                  {errors.orderId && (
                    <p className='text-danger text-sm mt-1'>{errors.orderId}</p>
                  )}
                </div>
              )}
              
              {/* Исполнитель */}
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Исполнитель
                </label>
                <Select
                  className='input w-full'
                  value={form.assignedTo}
                  onChange={(e) => handleInputChange('assignedTo', e.target.value)}
                >
                  {assignees.map(assignee => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </Select>
              </div>
              
              {/* Срок выполнения */}
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Срок выполнения
                </label>
                <input
                  type='date'
                  className='input w-full'
                  value={form.dueDate}
                  onChange={(e) => handleInputChange('dueDate', e.target.value)}
                  min={today}
                />
                {form.dueDate && (
                  <p className='text-xs text-muted mt-1'>
                    {new Date(form.dueDate).toLocaleDateString('ru-RU', { 
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </div>
              
              {/* Время напоминания */}
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Время напоминания
                </label>
                <input
                  type='time'
                  className='input w-full'
                  value={form.reminderTime}
                  onChange={(e) => handleInputChange('reminderTime', e.target.value)}
                />
              </div>
              
              {/* Заметки/результат */}
              <div className='md:col-span-2'>
                <label className='block text-sm font-medium mb-2'>
                  Заметки или результат
                </label>
                <textarea
                  className='input w-full min-h-[60px] resize-y'
                  value={form.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder='Результат выполнения, важные заметки...'
                  rows={2}
                />
              </div>
            </div>
          </form>
        </div>
        
        <div className='p-6 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-bg/90'>
          <button
            type='button'
            onClick={onClose}
            className='btn secondary'
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type='submit'
            onClick={handleSubmit}
            className='btn'
            disabled={saving}
          >
            {saving ? (
              <>
                <div className='inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2'></div>
                Сохранение...
              </>
            ) : isEditing ? 'Сохранить изменения' : 'Создать задачу'}
          </button>
        </div>
      </div>
    </div>
  );
}