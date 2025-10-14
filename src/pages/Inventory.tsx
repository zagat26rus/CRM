import { useEffect, useState } from 'react'
import { stock, Product } from '../api'
import { useAuth } from '../store/auth'
import { Input } from '../components/Form'

export default function Inventory(){
  const { token } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<Partial<Product>>({ name:'', price:0, qty:0, sku:'' })

  useEffect(()=>{ (async()=>{ if(!token) return; setProducts(await stock.products(token)) })() },[token])

  async function add(){
    const created = await stock.addProduct(token!, { name: form.name, price: Number(form.price||0), qty: Number(form.qty||0), sku: form.sku })
    setProducts([created, ...products])
    setForm({ name:'', price:0, qty:0, sku:'' })
  }

  return (
    <div className='space-y-4'>
      <div className='card'>
        <div className='card-inner grid md:grid-cols-4 gap-3'>
          <label className='block'><span className='label'>Название</span><Input value={form.name||''} onChange={e=>setForm({...form, name:e.target.value})}/></label>
          <label className='block'><span className='label'>SKU</span><Input value={form.sku||''} onChange={e=>setForm({...form, sku:e.target.value})}/></label>
          <label className='block'><span className='label'>Цена, ₽</span><Input type='number' value={String(form.price||0)} onChange={e=>setForm({...form, price:Number(e.target.value)})}/></label>
          <label className='block'><span className='label'>Кол-во</span><Input type='number' value={String(form.qty||0)} onChange={e=>setForm({...form, qty:Number(e.target.value)})}/></label>
          <div className='md:col-span-4 flex items-end'><button className='btn' onClick={add}>Добавить позицию</button></div>
        </div>
      </div>

      <div className='card overflow-auto'>
        <table className='table min-w-[800px]'>
          <thead><tr><th>ID</th><th>Название</th><th>SKU</th><th>Цена</th><th>Остаток</th><th>Создан</th></tr></thead>
          <tbody>
            {products.map(p => <tr key={p.id}><td>#{p.id}</td><td>{p.name}</td><td className='text-muted'>{p.sku||'-'}</td><td>{p.price.toLocaleString('ru-RU')}</td><td>{p.qty}</td><td className='text-muted'>{new Date(p.createdAt).toLocaleDateString()}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
