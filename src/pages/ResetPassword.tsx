import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов')
      return
    }
    if (password !== repeat) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch('/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Не удалось сменить пароль')
      localStorage.removeItem('authRemember')
      localStorage.removeItem('authPass')
      auth.setToken(data.token)
      useAuth.setState({ user: data.user, company: data.company })
      navigate('/', { replace: true })
    } catch (e: any) {
      setError(e?.message || 'Не удалось сменить пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-[calc(100vh-56px)] flex items-center justify-center'>
      <div className='card w-full max-w-md'>
        <div className='card-inner space-y-5'>
          <div>
            <h1 className='text-2xl font-bold'>Новый пароль</h1>
            <div className='text-sm text-muted mt-1'>Придумайте пароль для входа в CRM</div>
          </div>

          {!token && (
            <div className='p-3 border border-danger text-danger rounded-xl bg-bg'>
              В ссылке нет кода восстановления. Запросите письмо ещё раз на странице входа.
            </div>
          )}
          {error && <div className='p-3 border border-danger text-danger rounded-xl bg-bg'>{error}</div>}

          {token && (
            <>
              <div>
                <label className='label'>Новый пароль</label>
                <input
                  className='input'
                  type='password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder='Минимум 6 символов'
                  autoComplete='new-password'
                />
              </div>
              <div>
                <label className='label'>Повторите пароль</label>
                <input
                  className='input'
                  type='password'
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder='••••••••'
                  autoComplete='new-password'
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password && repeat && !loading) submit()
                  }}
                />
              </div>
              <button className='btn w-full' onClick={submit} disabled={loading || !password || !repeat}>
                {loading ? 'Сохранение…' : 'Сохранить пароль'}
              </button>
            </>
          )}

          <Link className='btn secondary w-full' to='/login'>Вернуться ко входу</Link>
        </div>
      </div>
    </div>
  )
}
