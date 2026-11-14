import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('Проверяем ссылку…')

  useEffect(() => {
    const token = params.get('token') || ''
    if (!token) {
      setState('error')
      setMessage('В ссылке отсутствует код подтверждения.')
      return
    }
    ;(async () => {
      try {
        const res = await apiFetch('/auth/email-verification/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Не удалось подтвердить email')
        auth.setToken(data.token)
        useAuth.setState({ user: data.user, company: data.company })
        setState('ok')
        setMessage('Email подтверждён. Аккаунт готов к работе.')
      } catch (error: any) {
        setState('error')
        setMessage(error?.message || 'Ссылка недействительна или истекла.')
      }
    })()
  }, [])

  return (
    <div className='min-h-[calc(100vh-56px)] flex items-center justify-center'>
      <div className='card w-full max-w-md'>
        <div className='card-inner text-center space-y-5'>
          <div className={`text-4xl ${state === 'loading' ? 'animate-pulse' : ''}`}>
            {state === 'loading' ? '…' : state === 'ok' ? '✓' : '!'}
          </div>
          <div>
            <h1 className='text-2xl font-bold'>Подтверждение email</h1>
            <p className={`text-sm mt-2 ${state === 'error' ? 'text-danger' : 'text-muted'}`}>{message}</p>
          </div>
          {state === 'ok' && (
            <button className='btn w-full' onClick={() => navigate('/', { replace: true })}>
              Перейти в CRM
            </button>
          )}
          {state === 'error' && (
            <Link className='btn secondary w-full' to='/login'>Вернуться ко входу</Link>
          )}
        </div>
      </div>
    </div>
  )
}

