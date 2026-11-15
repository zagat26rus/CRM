import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth'

export default function YandexLogin() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [message, setMessage] = useState('Входим через Яндекс…')

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hash.get('token') || ''
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) {
      navigate('/login?yandex_error=failed', { replace: true })
      return
    }
    auth.setToken(token)
    ;(async () => {
      try {
        const res = await apiFetch('/auth/me')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Не удалось завершить вход')
        useAuth.setState({ user: data.user, company: data.company })
        navigate('/', { replace: true })
      } catch (error: any) {
        auth.setToken(null)
        setMessage(error?.message || 'Не удалось завершить вход')
      }
    })()
  }, [])

  return (
    <div className='card auth-card'>
      <div className='card-inner text-center space-y-3'>
        <h1 className='text-2xl font-bold'>Яндекс</h1>
        <p className='text-sm text-muted'>{message}</p>
      </div>
    </div>
  )
}
