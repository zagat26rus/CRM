import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { API_URL } from '../config'

type InviteInfo = {
  invite: { email: string | null; role: 'admin' | 'director' | 'master'; expiresAt: string; usedAt?: string | null }
  company: { id: number; name: string }
}

export default function Invite() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const auth = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<InviteInfo | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/invites/${token}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Приглашение недоступно')
        if (cancelled) return
        setInfo(data)
        if (data?.invite?.email) setEmail(data.invite.email)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Приглашение недоступно')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (token) load()
    return () => { cancelled = true }
  }, [token])

  async function submit() {
    setError(null)
    setSaving(true)
    try {
      await auth.acceptInvite(token, { name: name.trim(), email: email.trim(), password })
      nav('/', { replace: true })
    } catch (e: any) {
      setError(e?.message || 'Ошибка регистрации')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='min-h-[calc(100vh-56px)] flex items-center justify-center'>
      <div className='card w-full max-w-md'>
        <div className='card-inner space-y-5'>
          <div>
            <h1 className='text-2xl font-bold'>Приглашение</h1>
            <div className='text-sm text-muted mt-1'>Регистрация сотрудника по ссылке</div>
          </div>

          {loading ? (
            <div className='text-muted text-sm'>Загрузка…</div>
          ) : error ? (
            <div className='space-y-3'>
              <div className='p-3 border border-danger text-danger rounded-xl bg-bg'>{error}</div>
              <div className='text-sm text-muted'>
                У вас уже есть аккаунт? <Link className='link' to='/login'>Войти</Link>
              </div>
            </div>
          ) : info ? (
            <>
              <div className='p-3 bg-surface rounded-xl border border-border'>
                <div className='text-xs text-muted'>Компания</div>
                <div className='font-medium'>{info.company.name}</div>
                <div className='text-xs text-muted mt-2'>Роль</div>
                <div className='font-medium'>{info.invite.role}</div>
              </div>

              <div>
                <label className='label'>Имя *</label>
                <input className='input' value={name} onChange={(e) => setName(e.target.value)} placeholder='Ваше имя' autoFocus />
              </div>
              <div>
                <label className='label'>Email *</label>
                <input className='input' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='email@example.com' disabled={!!info.invite.email} />
              </div>
              <div>
                <label className='label'>Пароль *</label>
                <input className='input' type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Минимум 6 символов' />
              </div>

              <button className='btn w-full' onClick={submit} disabled={saving || !name.trim() || !email.trim() || password.length < 6}>
                {saving ? 'Создание…' : 'Создать аккаунт'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}





