import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BALANCE_CHANGED_EVENT } from './utils/balanceEvents'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Payments from './pages/Payments'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import Clients from './pages/Clients'
import Marketing from './pages/Marketing'
import Services from './pages/Services'
import Inventory from './pages/Inventory'
import AiParts from './pages/AiParts'
import Track from './pages/Track'
import Shop from './pages/Shop'
import Reports from './pages/Reports'
import Announcements from './pages/Announcements'
import Help from './pages/Help'
import Chat from './pages/Chat'
import Documentation from './pages/Documentation'
import { useEffect, useState } from 'react'
import {Toasts} from './utils'
import Login from './pages/Login'
import Register from './pages/Register'
import Invite from './pages/Invite'
import { useAuth } from './auth'
import { apiFetch } from './api'
import GlobalSearch from './components/GlobalSearch'
import AiAssistant from './components/AiAssistant'

const menu = [
  { to: '/', label: 'Тренды' },
  { to: '/tasks', label: 'Задачи' },
  { to: '/orders', label: 'Заказы' },
  { to: '/payments', label: 'Платежи' },
  { to: '/clients', label: 'Клиенты' },
  { to: '/chat', label: 'Чат' },
  { to: '/marketing', label: 'Маркетинг' },
  { to: '/services', label: 'Услуги' },
  { to: '/inventory', label: 'Склад' },
  { to: '/ai-parts', label: 'Запчасти ИИ' },
  { to: '/shop', label: 'Магазин' },
  { to: '/documentation', label: 'Документация' },
  { to: '/reports', label: 'Отчеты' },
  { to: '/announcements', label: 'Объявления' },
  { to: '/settings', label: 'Настройки' },
  { to: '/help', label: 'Помощь' },
]

export default function App(){
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const loc = useLocation()
  const auth = useAuth()
  const bottomRoutes = ['/orders', '/tasks', '/clients', '/payments']
  const moreActive = !bottomRoutes.includes(loc.pathname)
  useEffect(()=>{ document.title = 'FixNet CRM — ' + (menu.find(m => m.to === loc.pathname)?.label || '') },[loc.pathname])
  useEffect(() => { auth.bootstrap() }, [])
  
  // Закрываем мобильное меню при смене страницы
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [loc.pathname])

  const isAuthRoute =
    loc.pathname === '/login' ||
    loc.pathname === '/register' ||
    loc.pathname.startsWith('/invite/') ||
    loc.pathname.startsWith('/track/')

  if (!auth.bootstrapped) {
    return (
      <div className='min-h-screen flex bg-bg text-text items-center justify-center'>
        <div className='text-muted text-sm'>Загрузка…</div>
      </div>
    )
  }

  if (!isAuthRoute && !auth.token) {
    return <Navigate to='/login' replace />
  }

  return (
    <div className='min-h-[100dvh] w-full max-w-full overflow-x-clip flex bg-bg text-text pt-[env(safe-area-inset-top)]'>
      {/* Desktop Sidebar */}
      {!isAuthRoute && (
      <aside className={'hidden lg:flex flex-col w-60 border-r border-border bg-bg/70'}>
        <div className='h-14 border-b border-border flex items-center px-4 font-bold'>
          <span className='text-primary'>FixNet</span>&nbsp;CRM
        </div>
        <nav className='flex-1 overflow-auto p-2 space-y-1'>
          {menu.map(m => (
            <NavLink key={m.to} to={m.to} end={m.to==='/'}
              className={({isActive}) => 
                'block px-3 py-2 rounded-xl transition ' + (isActive ? 'bg-primary text-black font-semibold' : 'hover:bg-surface text-text')
              }>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className='p-3 text-xs text-muted border-t border-border'>тёмная тема</div>
      </aside>
      )}

      {/* Mobile Menu Overlay */}
      {!isAuthRoute && mobileMenuOpen && (
        <div 
          className='fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden'
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      {!isAuthRoute && (
        <aside className={`fixed top-[env(safe-area-inset-top)] bottom-0 left-0 w-[min(18rem,88vw)] bg-bg border-r border-border z-50 transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className='h-14 border-b border-border flex items-center justify-between px-4 font-bold'>
            <span><span className='text-primary'>FixNet</span>&nbsp;CRM</span>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className='p-2 hover:bg-surface rounded-lg transition'
            >
              <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>
          <nav className='flex-1 overflow-auto p-2 space-y-1'>
            {menu.map(m => (
              <NavLink key={m.to} to={m.to} end={m.to==='/'}
                className={({isActive}) => 
                  'block px-3 py-3 rounded-xl transition text-base ' + (isActive ? 'bg-primary text-black font-semibold' : 'hover:bg-surface text-text')
                }>
                {m.label}
              </NavLink>
            ))}
          </nav>
          <div className='p-3 text-xs text-muted border-t border-border'>тёмная тема</div>
        </aside>
      )}

      {/* Main */}
      <main className='flex-1 min-w-0 w-full max-w-full overflow-x-clip pt-14 lg:pt-0'>
        {!isAuthRoute && <Topbar refreshKey={loc.pathname} onMenuClick={() => setMobileMenuOpen(true)} />}
        <div className='container-page pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8'>
          <Routes>
            <Route path='/login' element={<Login/>} />
            <Route path='/register' element={<Register/>} />
            <Route path='/invite/:token' element={<Invite/>} />
            <Route path='/track/:token' element={<Track/>} />

            <Route path='/' element={<Dashboard/>} />
            <Route path='/tasks' element={<Tasks/>} />
            <Route path='/orders' element={<Orders/>} />
            <Route path='/payments' element={<Payments/>} />
            <Route path='/clients' element={<Clients/>} />
            <Route path='/chat' element={<Chat/>} />
            <Route path='/marketing' element={<Marketing/>} />
            <Route path='/services' element={<Services/>} />
            <Route path='/inventory' element={<Inventory/>} />
            <Route path='/ai-parts' element={<AiParts/>} />
            <Route path='/shop' element={<Shop/>} />
            <Route path='/documentation' element={<Documentation/>} />
            <Route path='/reports' element={<Reports/>} />
            <Route path='/announcements' element={<Announcements/>} />
            <Route path='/settings' element={<Settings/>} />
            <Route path='/help' element={<Help/>} />
          </Routes>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {!isAuthRoute && (
        <nav className='fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-border z-40 lg:hidden pb-[env(safe-area-inset-bottom)]'>
          <div className='flex justify-around items-center h-14'>
            {[
              { to: '/orders', label: 'Заказы', icon: '📋' },
              { to: '/tasks', label: 'Задачи', icon: '✅' },
              { to: '/clients', label: 'Клиенты', icon: '👥' },
              { to: '/payments', label: 'Платежи', icon: '💰' },
            ].map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({isActive}) =>
                  `flex flex-col items-center justify-center flex-1 h-full min-h-11 transition ${
                    isActive ? 'text-primary' : 'text-muted'
                  }`
                }
              >
                <span className='text-lg leading-none mb-0.5' aria-hidden>{item.icon}</span>
                <span className='text-[11px]'>{item.label}</span>
              </NavLink>
            ))}
            <button
              type='button'
              onClick={() => setMobileMenuOpen(true)}
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-11 transition ${
                mobileMenuOpen || moreActive ? 'text-primary' : 'text-muted'
              }`}
            >
              <span className='text-lg leading-none mb-0.5' aria-hidden>⋯</span>
              <span className='text-[11px]'>Ещё</span>
            </button>
          </div>
        </nav>
      )}

      <Toasts />
      {!isAuthRoute && <AiAssistant />}
    </div>
  )
}

function Topbar({ refreshKey, onMenuClick }: { refreshKey: string; onMenuClick: () => void }){
  const [balance, setBalance] = useState<number | null>(null)
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function loadBalance() {
      try {
        const res = await apiFetch('/payments/balance')
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (!cancelled) {
          setBalance(typeof data?.balance === 'number' ? data.balance : null)
        }
      } catch (e) {
        if (!cancelled) setBalance(null)
      }
    }

    loadBalance()
    const onBalanceChanged = () => { loadBalance() }
    window.addEventListener(BALANCE_CHANGED_EVENT, onBalanceChanged)
    return () => {
      cancelled = true
      window.removeEventListener(BALANCE_CHANGED_EVENT, onBalanceChanged)
    }
  }, [refreshKey])

  return (
    <div className='h-14 border-b border-border flex items-center justify-between gap-2 px-2.5 md:px-4 fixed top-[env(safe-area-inset-top)] left-0 right-0 lg:sticky lg:top-0 bg-bg/95 backdrop-blur z-40'>
      {/* Mobile: Menu button + Logo */}
      <div className='flex items-center gap-1.5 shrink-0 lg:hidden'>
        <button 
          onClick={onMenuClick}
          className='p-2 hover:bg-surface rounded-lg transition touch-manipulation'
          aria-label='Открыть меню'
        >
          <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
          </svg>
        </button>
        <span className='font-bold text-sm whitespace-nowrap'>
          <span className='text-primary'>FixNet</span>&nbsp;CRM
        </span>
      </div>

      {/* Desktop: Balance */}
      <div className='hidden lg:flex items-center gap-2'>
        <span className='text-sm text-muted'>Баланс</span>
        <span className='font-semibold'>{(balance ?? 0).toLocaleString('ru-RU')} ₽</span>
      </div>

      {/* Mobile: Balance (compact) */}
      <div className='flex lg:hidden min-w-0 flex-1 justify-center items-center gap-1'>
        <span className='hidden min-[390px]:inline text-[11px] text-muted'>Баланс:</span>
        <span className='font-semibold text-xs min-[390px]:text-sm truncate'>{(balance ?? 0).toLocaleString('ru-RU')} ₽</span>
      </div>

      {/* Right side actions */}
      <div className='flex items-center gap-1.5 shrink-0'>
        <GlobalSearch />
        <button type='button' className='btn secondary hidden md:inline-flex text-sm px-3 py-2' onClick={() => navigate('/help')}>
          Справка
        </button>
        <div className='flex items-center gap-2'>
          <button 
            className='btn secondary hidden sm:inline-flex text-sm px-3 py-2' 
            onClick={() => auth.logout()}
          >
            Выйти
          </button>
          {/* Mobile: Logout icon */}
          <button 
            className='sm:hidden p-2 hover:bg-surface rounded-lg transition touch-manipulation'
            onClick={() => auth.logout()}
            aria-label='Выйти'
          >
            <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
