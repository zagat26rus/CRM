import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Payments from './pages/Payments'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import Clients from './pages/Clients'
import Marketing from './pages/Marketing'
import Services from './pages/Services'
import Inventory from './pages/Inventory'
import Shop from './pages/Shop'
import Reports from './pages/Reports'
import Announcements from './pages/Announcements'
import Help from './pages/Help'
import { useEffect } from 'react'
import {Toasts} from './utils'
import Login from './pages/Login'
import { useAuth } from './store/auth'

const menu = [
  { to: '/', label: 'Тренды' },
  { to: '/tasks', label: 'Задачи' },
  { to: '/orders', label: 'Заказы' },
  { to: '/payments', label: 'Платежи' },
  { to: '/clients', label: 'Клиенты' },
  { to: '/marketing', label: 'Маркетинг' },
  { to: '/services', label: 'Услуги' },
  { to: '/inventory', label: 'Склад' },
  { to: '/shop', label: 'Магазин' },
  { to: '/reports', label: 'Отчеты' },
  { to: '/announcements', label: 'Объявления' },
  { to: '/settings', label: 'Настройки' },
  { to: '/help', label: 'Помощь' },
]

export default function App(){
  const { token } = useAuth()
  // Глобальный гейт: без токена показываем только Login
  if(!token) return <Login/>

  return <AuthedApp />
}

function AuthedApp(){
  const { user, logout } = useAuth()
  const loc = useLocation()
  useEffect(()=>{ document.title = 'FixNet CRM — ' + (menu.find(m => m.to === loc.pathname)?.label || '') },[loc.pathname])

  return (
    <div className='min-h-screen flex bg-bg text-text'>
      {/* Sidebar */}
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
        <div className='p-3 text-xs text-muted border-t border-border'>v1.0 demo • тёмная тема</div>
      </aside>

      {/* Main */}
      <main className='flex-1'>
        <div className='h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 bg-bg/80 backdrop-blur z-40'>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-muted'>Пользователь</span>
            <span className='font-semibold'>{user?.name}</span>
          </div>
          <div className='flex gap-2'>
            <input placeholder='Поиск' className='input w-72 hidden md:block' />
            <button className='btn secondary'>Справка</button>
            <button className='btn ghost' onClick={logout}>Выйти</button>
          </div>
        </div>

        <div className='container-page'>
          <Routes>
            <Route path='/' element={<Dashboard/>} />
            <Route path='/tasks' element={<Tasks/>} />
            <Route path='/orders' element={<Orders/>} />
            <Route path='/payments' element={<Payments/>} />
            <Route path='/clients' element={<Clients/>} />
            <Route path='/marketing' element={<Marketing/>} />
            <Route path='/services' element={<Services/>} />
            <Route path='/inventory' element={<Inventory/>} />
            <Route path='/shop' element={<Shop/>} />
            <Route path='/reports' element={<Reports/>} />
            <Route path='/announcements' element={<Announcements/>} />
            <Route path='/settings' element={<Settings/>} />
            <Route path='/help' element={<Help/>} />
          </Routes>
        </div>
      </main>

      <Toasts />
    </div>
  )
}
