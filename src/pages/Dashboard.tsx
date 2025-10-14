import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../store/auth'
import { useToast } from '../utils'

type DayCount = { d:string; c:number }
type StatusCount = { status:string; c:number }

export default function Dashboard(){
  const { token } = useAuth()
  const toast = useToast()
  const [avg, setAvg] = useState(0)
  const [balance, setBalance] = useState(0)
  const [days, setDays] = useState<DayCount[]>([])
  const [statuses, setStatuses] = useState<StatusCount[]>([])

  useEffect(()=>{
    async function load(){
      try {
        const sum = await api.get<{ balance:number; avgOrder:number }>('/api/stats/summary', token!)
        setAvg(Math.round(sum.avgOrder))
        setBalance(Math.round(sum.balance))
        setDays(await api.get<DayCount[]>('/api/stats/orders-by-day', token!))
        setStatuses(await api.get<StatusCount[]>('/api/stats/statuses', token!))
      } catch(e:any){ toast.push('Ошибка: '+e.message) }
    }
    if(token) load()
  }, [token])

  return (
    <div className='space-y-6'>
      <div className='grid md:grid-cols-3 gap-4'>
        <div className='card'><div className='card-inner'><div className='text-muted text-sm'>Средний чек заказов</div><div className='text-2xl font-semibold mt-2'>{avg.toLocaleString('ru-RU')} ₽</div></div></div>
        <div className='card'><div className='card-inner'><div className='text-muted text-sm'>Средний чек продаж</div><div className='text-2xl font-semibold mt-2'>0 ₽</div></div></div>
        <div className='card'><div className='card-inner'><div className='text-muted text-sm'>Баланс</div><div className='text-2xl font-semibold mt-2'>{balance.toLocaleString('ru-RU')} ₽</div></div></div>
      </div>

      <div className='grid lg:grid-cols-3 gap-4'>
        <div className='card lg:col-span-2'>
          <div className='card-inner'>
            <div className='flex items-center justify-between mb-4'>
              <div className='font-semibold'>Заказы по дням</div>
              <div className='text-muted text-sm'>7 дней</div>
            </div>
            <div className='h-64 flex items-end gap-3'>
              {days.map((v,i)=>(
                <div key={i} className='flex-1 bg-surface border border-border rounded-xl flex items-end'>
                  <div className='w-full bg-primary rounded-xl' style={{height: Math.min(100, (v.c*12))+'%'}}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className='card'>
          <div className='card-inner'>
            <div className='font-semibold mb-4'>Заказы по статусам</div>
            <div className='space-y-3'>
              {statuses.map(s => <StatusRow key={s.status} label={s.status} value={s.c}/>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusRow({label, value}:{label:string; value:number}){
  return (
    <div>
      <div className='flex justify-between text-sm mb-1'><span className='text-muted'>{label}</span><span>{value}</span></div>
      <div className='h-2 bg-surface rounded-full overflow-hidden'>
        <div className='h-full bg-primary' style={{width: Math.min(100, value*10)+'%'}}/>
      </div>
    </div>
  )
}
