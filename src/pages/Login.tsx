import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getRememberedCredentials, useAuth } from '../auth'
import { apiFetch } from '../api'

export default function Login() {
  const nav = useNavigate()
  const auth = useAuth()
  const remembered = getRememberedCredentials()
  const [email, setEmail] = useState(remembered?.email || '')
  const [password, setPassword] = useState(remembered?.password || '')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (auth.token) {
      nav('/', { replace: true })
    }
  }, [auth.token, nav])

  async function submit() {
    setError(null)
    setNotice(null)
    setVerificationEmail('')
    setLoading(true)
    try {
      await auth.login(email, password, remember)
      nav('/', { replace: true })
    } catch (e: any) {
      setError(e?.message || 'Ошибка входа')
      if (e?.code === 'email_verification_required') setVerificationEmail(e?.email || email)
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    setResending(true)
    try {
      const res = await apiFetch('/auth/email-verification/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail || email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Не удалось отправить письмо')
      setError(null)
      setNotice('Письмо отправлено повторно. Проверьте почту.')
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить письмо')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className='min-h-[calc(100vh-56px)] flex items-center justify-center'>
      <div className='card w-full max-w-md'>
        <div className='card-inner space-y-5'>
          <div>
            <h1 className='text-2xl font-bold'>Вход</h1>
            <div className='text-sm text-muted mt-1'>Войдите в систему</div>
          </div>

          {error && <div className='p-3 border border-danger text-danger rounded-xl bg-bg'>{error}</div>}
          {notice && <div className='p-3 border border-success text-success rounded-xl bg-bg'>{notice}</div>}
          {verificationEmail && (
            <button type='button' className='btn secondary w-full' disabled={resending} onClick={resendVerification}>
              {resending ? 'Отправка…' : 'Отправить письмо подтверждения ещё раз'}
            </button>
          )}

          <div>
            <label className='label'>Email</label>
            <input
              className='input'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='email@example.com'
              autoComplete='username'
            />
          </div>
          <div>
            <label className='label'>Пароль</label>
            <input
              className='input'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='••••••••'
              autoComplete='current-password'
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email && password && !loading) submit()
              }}
            />
          </div>

          <label className='flex items-center gap-2 text-sm text-muted cursor-pointer select-none'>
            <input
              type='checkbox'
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className='accent-primary'
            />
            Запомнить меня и входить автоматически
          </label>

          <button className='btn w-full' onClick={submit} disabled={loading || !email || !password}>
            {loading ? 'Вход…' : 'Войти'}
          </button>

          <div className='text-sm text-muted'>
            Нет аккаунта? <Link className='link' to='/register'>Регистрация</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
