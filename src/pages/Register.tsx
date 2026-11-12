import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

type Step = 1 | 2 | 3

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: 'Аккаунт' },
    { n: 2, label: 'Компания' },
    { n: 3, label: 'Готово' }
  ] as const

  return (
    <div className='flex items-center gap-3'>
      {items.map((it, idx) => (
        <div key={it.n} className='flex items-center gap-3'>
          <div
            className={
              'w-8 h-8 rounded-full flex items-center justify-center text-sm border ' +
              (step === it.n ? 'border-primary text-primary' : step > it.n ? 'border-border text-text' : 'border-border text-muted')
            }
          >
            {it.n}
          </div>
          <div className={'text-sm ' + (step === it.n ? 'text-text' : 'text-muted')}>{it.label}</div>
          {idx < items.length - 1 ? <div className='w-8 h-px bg-border' /> : null}
        </div>
      ))}
    </div>
  )
}

export default function Register() {
  const nav = useNavigate()
  const auth = useAuth()
  const [step, setStep] = useState<Step>(1)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [companyName, setCompanyName] = useState('')
  const [companyInn, setCompanyInn] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canNext = useMemo(() => {
    if (step === 1) return name.trim() && email.trim() && password.length >= 6
    if (step === 2) return companyName.trim().length > 0
    return true
  }, [step, name, email, password, companyName])

  async function next() {
    setError(null)
    if (step === 1) setStep(2)
    else if (step === 2) {
      setLoading(true)
      try {
        await auth.registerOwner({
          name: name.trim(),
          email: email.trim(),
          password,
          company: {
            name: companyName.trim(),
            inn: companyInn.trim() || undefined, // НЕ обязательный
            city: companyCity.trim() || undefined,
            address: companyAddress.trim() || undefined
          }
        })
        setStep(3)
      } catch (e: any) {
        setError(e?.message || 'Ошибка регистрации')
      } finally {
        setLoading(false)
      }
    } else {
      nav('/', { replace: true })
    }
  }

  function back() {
    setError(null)
    if (step === 2) setStep(1)
  }

  return (
    <div className='min-h-[calc(100vh-56px)] flex items-center justify-center'>
      <div className='card w-full max-w-2xl'>
        <div className='card-inner space-y-6'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h1 className='text-2xl font-bold'>Регистрация</h1>
              <div className='text-sm text-muted mt-1'>Создание аккаунта и настройка компании</div>
            </div>
            <Stepper step={step} />
          </div>

          {error && <div className='p-3 border border-danger text-danger rounded-xl bg-bg'>{error}</div>}

          {step === 1 && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='md:col-span-2'>
                <label className='label'>Ваше имя *</label>
                <input className='input' value={name} onChange={(e) => setName(e.target.value)} placeholder='Иван Иванов' autoFocus />
              </div>
              <div>
                <label className='label'>Email *</label>
                <input className='input' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='email@example.com' />
              </div>
              <div>
                <label className='label'>Пароль *</label>
                <input className='input' type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Минимум 6 символов' />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='md:col-span-2'>
                <label className='label'>Название компании *</label>
                <input className='input' value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder='FixNet' autoFocus />
              </div>
              <div>
                <label className='label'>ИНН</label>
                <input className='input' value={companyInn} onChange={(e) => setCompanyInn(e.target.value)} placeholder='Необязательно' />
              </div>
              <div>
                <label className='label'>Город</label>
                <input className='input' value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder='Необязательно' />
              </div>
              <div className='md:col-span-2'>
                <label className='label'>Адрес</label>
                <input className='input' value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder='Необязательно' />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className='space-y-2'>
              <div className='text-lg font-semibold'>Аккаунт создан</div>
              <div className='text-sm text-muted'>Можно переходить в систему.</div>
            </div>
          )}

          <div className='flex items-center justify-between gap-3 pt-2 border-t border-border'>
            <div className='text-sm text-muted'>
              Уже есть аккаунт? <Link className='link' to='/login'>Войти</Link>
            </div>
            <div className='flex gap-2'>
              {step !== 1 && step !== 3 && (
                <button className='btn secondary' onClick={back} disabled={loading}>
                  Назад
                </button>
              )}
              <button className='btn' onClick={next} disabled={loading || !canNext}>
                {loading ? 'Сохранение…' : step === 3 ? 'Перейти в систему' : 'Далее'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}





