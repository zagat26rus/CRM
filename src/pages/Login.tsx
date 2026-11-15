import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getRememberedCredentials, useAuth } from '../auth'
import { apiFetch, apiUrl } from '../api'

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
  const [recovery, setRecovery] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)
  const [yandexEnabled, setYandexEnabled] = useState(false)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (auth.token) {
      nav('/', { replace: true })
    }
  }, [auth.token, nav])

  useEffect(() => {
    const code = params.get('yandex_error')
    if (!code) return
    const messages: Record<string, string> = {
      no_account: 'В CRM нет аккаунта с почтой этого Яндекса. Зарегистрируйтесь или войдите по паролю.',
      blocked: 'Пользователь заблокирован.',
      denied: 'Вход через Яндекс отменён.',
      no_email: 'Яндекс не передал адрес почты. Разрешите доступ к почте и попробуйте снова.',
      conflict: 'Эта почта уже связана с другим аккаунтом Яндекса.',
      state: 'Ссылка входа устарела. Нажмите «Войти через Яндекс» ещё раз.',
      failed: 'Не удалось войти через Яндекс. Попробуйте ещё раз.',
    }
    setError(messages[code] || messages.failed)
    params.delete('yandex_error')
    setParams(params, { replace: true })
  }, [])

  useEffect(() => {
    apiFetch('/auth/yandex/configured')
      .then((res) => res.json())
      .then((data) => setYandexEnabled(Boolean(data?.enabled)))
      .catch(() => setYandexEnabled(false))
  }, [])

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

  async function requestReset() {
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const res = await apiFetch('/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Не удалось отправить письмо')
      setRecoverySent(true)
      setNotice(data?.message || 'Если этот адрес зарегистрирован, мы отправили на него ссылку.')
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить письмо')
    } finally {
      setLoading(false)
    }
  }

  function openRecovery() {
    setRecovery(true)
    setRecoverySent(false)
    setError(null)
    setNotice(null)
    setVerificationEmail('')
  }

  function closeRecovery() {
    setRecovery(false)
    setRecoverySent(false)
    setError(null)
    setNotice(null)
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
    <div className='card auth-card'>
      <div className='card-inner space-y-5'>
          <div>
            <h1 className='text-2xl font-bold'>{recovery ? 'Восстановление пароля' : 'Вход'}</h1>
            <div className='text-sm text-muted mt-1'>
              {recovery ? 'Отправим ссылку для нового пароля на почту' : 'Войдите в систему'}
            </div>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && recovery && email && !loading) requestReset()
              }}
            />
          </div>
          {!recovery && (
            <>
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
                <div className='mt-2 text-right'>
                  <button type='button' className='text-sm link' onClick={openRecovery}>
                    Забыли пароль?
                  </button>
                </div>
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
              {yandexEnabled && (
                <>
                  <div className='text-center text-xs text-muted'>или</div>
                  <a className='btn secondary w-full' href={apiUrl('/auth/yandex/start')}>
                    Войти через Яндекс
                  </a>
                </>
              )}
            </>
          )}

          {recovery && (
            <>
              <button className='btn w-full' onClick={requestReset} disabled={loading || !email}>
                {loading ? 'Отправка…' : recoverySent ? 'Отправить ссылку ещё раз' : 'Отправить ссылку'}
              </button>
              <button type='button' className='btn secondary w-full' onClick={closeRecovery}>
                Вернуться ко входу
              </button>
            </>
          )}

          <div className='text-sm text-muted'>
            Нет аккаунта? <Link className='link' to='/register'>Регистрация</Link>
          </div>
      </div>
    </div>
  )
}
