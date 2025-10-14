import { useEffect, useState } from 'react'
import MoneyModal from '../components/MoneyModal'
import { useAuth } from '../store/auth'
import { api } from '../api'
import { useToast } from '../utils'

type Tx = { id:number; type:'Приход'|'Расход'; method:string; sum:number; comment?:string; createdAt:string }

export default function Payments(){
  const [rows, setRows] = useState<Tx[]>([])
  const [balance, setBalance] = useState(0)
  const [open, setOpen] = useState<null|('Приход'|'Расход')>(null)
  const { token } = useAuth()
  const toast = useToast()

  async function load(){
    try {
      const list = await api.get<Tx[]>('/api/payments', token!)
      setRows(list)
      const summary = await api.get<{balance:number, avgOrder:number}>('/api/stats/summary', token!)
      setBalance(Math.round(summary.balance))
    } catch(e:any){
      toast.push('Ошибка: ' + e.message)
    }
  }

  useEffect(()=>{ if(token) load() },[token])

  async function addTx(type:'Приход'|'Расход', sum:number){
    try {
      const tx = await api.post<Tx>('/api/payments', token!, { type, method:'Карта', sum })
      setRows([tx, ...rows])
      const summary = await api.get<{balance:number, avgOrder:number}>('/api/stats/summary', token!)
      setBalance(Math.round(summary.balance))
    } catch(e:any){
      toast.push('Ошибка: ' + e.message)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='text-lg font-semibold'>Баланс <span className='text-primary'>{balance.toLocaleString('ru-RU')} ₽</span></div>
        <div className='flex gap-2'>
          <button className='btn secondary' onClick={()=>setOpen('Приход')}>+ Приход</button>
          <button className='btn ghost' onClick={()=>setOpen('Расход')}>− Расход</button>
        </div>
      </div>

      <div className='card overflow-auto'>
        <table className='table min-w-[800px]'>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Метод</th>
              <th>Сумма, ₽</th>
              <th>Комментарий</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={5} className='py-10 text-center text-muted'>Здесь пока пусто</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.type}</td>
                <td>{r.method}</td>
                <td className={r.type==='Расход'?'text-danger':'text-success'}>{r.type==='Расход' ? '-' : '+'}{r.sum.toLocaleString('ru-RU')}</td>
                <td>{r.comment||'-'}</td>
                <td className='text-muted'>{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <MoneyModal title={open} onClose={()=>setOpen(null)} onSave={(sum)=>addTx(open!, sum)} />}
    </div>
  )
}
