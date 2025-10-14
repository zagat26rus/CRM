import { FormEvent, useState } from 'react'
import { useAuth } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../utils'
import { Input } from '../components/Form'

export default function Login(){
  const [email, setEmail] = useState('admin@fixnet.local')
  const [password, setPassword] = useState('admin123')
  const { login, loading } = useAuth()
  const nav = useNavigate()
  const toast = useToast()

  async function onSubmit(e: FormEvent){
    e.preventDefault()
    try {
      await login(email, password)
      toast.push('Вход выполнен')
      nav('/')
    } catch (e:any){
      toast.push('Ошибка: ' + e.message)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-bg'>
      <form onSubmit={onSubmit} className='card w-full max-w-sm'>
        <div className='card-inner space-y-4'>
          <div className='text-center text-2xl font-semibold'><span className='text-primary'>FixNet</span> CRM</div>
          <div className='text-center text-muted text-sm'>Вход в систему</div>
          <label className='block'>
            <span className='label'>Email</span>
            <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder='email'/>
          </label>
          <label className='block'>
            <span className='label'>Пароль</span>
            <Input type='password' value={password} onChange={e=>setPassword(e.target.value)} placeholder='пароль'/>
          </label>
          <button className='btn w-full' disabled={loading}>{loading? 'Входим...' : 'Войти'}</button>
          <div className='text-center text-xs text-muted'>API: {import.meta.env.VITE_API_URL || 'http://localhost:4001'}</div>
        </div>
      </form>
    </div>
  )
}
