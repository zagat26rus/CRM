import { useEffect, useState } from 'react'
import OrderForm, { Order } from '../components/OrderForm'
import { api } from '../api'
import { useAuth } from '../store/auth'
import { useToast } from '../utils'

export default function Orders(){
  const [rows, setRows] = useState<Order[]>([])
  const [open, setOpen] = useState(false)
  const { token } = useAuth()
  const toast = useToast()

  async function load(){
    const data = await api.get<Order[]>('/api/orders', token!)
    setRows(data as any)
  }
  useEffect(()=>{ if(token) load().catch(e=>toast.push('Ошибка: '+e.message)) },[token])

  async function saveNew(o: Order){
    try {
      const created = await api.post<Order>('/api/orders', token!, o)
      setRows([created, ...rows])
    } catch(e:any){ toast.push('Ошибка: '+e.message) }
  }

  async function changeStatus(id:number, status:string){
    const row = rows.find(r=>r.id===id)
    if(!row) return
    try {
      const upd = await api.put<Order>('/api/orders/'+id, token!, {...row, status})
      setRows(rows.map(r=> r.id===id ? upd : r))
    } catch(e:any){ toast.push('Ошибка: '+e.message) }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2 text-sm'>
          <button className='tag'>Все</button>
          <button className='tag'>Платный</button>
          <button className='tag'>Выездной</button>
          <button className='tag'>Гарантийный</button>
        </div>
        <div className='flex items-center gap-2'>
          <input placeholder='Поиск' className='input w-72'/>
          <button className='btn' onClick={()=>setOpen(true)}>Создать</button>
        </div>
      </div>

      <div className='card overflow-auto'>
        <table className='table min-w-[1200px]'>
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Статус</th>
              <th>Клиент</th>
              <th>Телефон</th>
              <th>Причина обращения</th>
              <th>Устройство</th>
              <th>Бренд</th>
              <th>Модель</th>
              <th>Итого, ₽</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td>
                  <select defaultValue={r.status} className='select' onChange={(e)=>changeStatus(r.id, e.target.value)}>
                    <option>В работе</option>
                    <option>Готов</option>
                    <option>Закрыт</option>
                  </select>
                </td>
                <td>{r.clientName || (r as any).client || '-'}</td>
                <td className='text-muted'>{r.phone}</td>
                <td>{r.problem}</td>
                <td>{(r as any).deviceType||'Смартфон'}</td>
                <td>{r.brand}</td>
                <td>{r.model}</td>
                <td>{(r.price||0).toLocaleString('ru-RU')}</td>
                <td>{new Date(r.createdAt||'').toISOString().slice(0,10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <OrderForm onClose={()=>setOpen(false)} onSave={(o)=>saveNew(o)} />}
    </div>
  )
}
