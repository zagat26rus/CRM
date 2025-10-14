import { useEffect, useState } from 'react'
import { Input, Textarea } from './Form'
import { useAuth } from '../store/auth'
import { catalogs } from '../api'

export type Order = {
  id?: number
  clientName?: string
  phone?: string
  problem?: string
  deviceType?: string
  brand?: string
  model?: string
  status?: string
  price?: number
  createdAt?: string
}

type Props = {
  onClose: () => void
  onSave: (order: Order) => void
}

export default function OrderForm({ onClose, onSave }: Props){
  const { token } = useAuth()
  const [types, setTypes] = useState<{id:number; name:string}[]>([])
  const [brands, setBrands] = useState<{id:number; name:string}[]>([])
  const [models, setModels] = useState<{id:number; brandId:number; name:string}[]>([])

  const [form, setForm] = useState<Order>({
    clientName: '',
    phone: '',
    problem: '',
    deviceType: 'Смартфон',
    brand: '',
    model: '',
    status: 'В работе',
    price: 0
  })

  useEffect(()=>{
    (async()=>{
      if(!token) return
      const t = await catalogs.types(token)
      setTypes(t)
      const b = await catalogs.brands(token)
      setBrands(b)
    })()
  },[token])

  async function onBrandChange(name:string){
    setForm({...form, brand:name, model:''})
    const brand = brands.find(b=>b.name===name)
    if(brand && token){
      setModels(await catalogs.models(token, brand.id))
    } else {
      setModels([])
    }
  }

  function submit(){
    onSave({
      ...form,
      price: Number(form.price||0)
    })
    onClose()
  }

  return (
    <div className='dialog'>
      <div className='dialog-panel max-w-3xl'>
        <div className='dialog-title'>Заказ</div>

        <div className='grid md:grid-cols-2 gap-4'>
          <label className='block'>
            <span className='label'>Клиент *</span>
            <Input value={form.clientName} onChange={e=>setForm({...form, clientName:e.target.value})} placeholder='Клиент'/>
          </label>
          <label className='block'>
            <span className='label'>Телефон</span>
            <Input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} placeholder='+7 ...'/>
          </label>

          <label className='block'>
            <span className='label'>Причина обращения *</span>
            <Input value={form.problem} onChange={e=>setForm({...form, problem:e.target.value})} placeholder='Опиши проблему'/>
          </label>

          <label className='block'>
            <span className='label'>Вид устройства</span>
            <select className='select' value={form.deviceType} onChange={e=>setForm({...form, deviceType:e.target.value})}>
              {[ 'Смартфон', ...types.filter(t=>t.name!=='Смартфон').map(t=>t.name) ].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          <label className='block'>
            <span className='label'>Бренд *</span>
            <select className='select' value={form.brand} onChange={e=>onBrandChange(e.target.value)}>
              <option value=''>— выберите —</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </label>

          <label className='block'>
            <span className='label'>Модель *</span>
            <select className='select' value={form.model} onChange={e=>setForm({...form, model:e.target.value})}>
              <option value=''>— выберите —</option>
              {models.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </label>

          <label className='block'>
            <span className='label'>Статус</span>
            <select className='select' value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
              <option>В работе</option>
              <option>Готов</option>
              <option>Закрыт</option>
            </select>
          </label>

          <label className='block'>
            <span className='label'>Оценка стоимости, ₽</span>
            <Input type='number' value={String(form.price||0)} onChange={e=>setForm({...form, price:Number(e.target.value)})}/>
          </label>

          <label className='block md:col-span-2'>
            <span className='label'>Комментарий</span>
            <Textarea rows={3} value={(form as any).comment||''} onChange={e=>setForm({...form, comment:(e.target as any).value})} placeholder='Дополнительно'/>
          </label>
        </div>

        <div className='dialog-actions'>
          <button className='btn ghost' onClick={onClose}>Отмена</button>
          <button className='btn' onClick={submit}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
