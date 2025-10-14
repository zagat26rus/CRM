import { useEffect, useState } from 'react'
import { stock, Product, shop } from '../api'
import { useAuth } from '../store/auth'
import { useToast } from '../utils'

type CartItem = { product: Product; qty: number }

export default function Shop(){
  const { token } = useAuth()
  const [items, setItems] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const toast = useToast()

  async function load(){ if(!token) return; const all = await stock.products(token); setItems(all.filter(p => (p.qty||0) > 0)) }
  useEffect(()=>{ load() },[token])

  function addToCart(p:Product){
    setCart(prev => {
      const ex = prev.find(i => i.product.id === p.id)
      if(ex){ return prev.map(i => i.product.id===p.id ? {...i, qty: Math.min(i.qty+1, p.qty)} : i) }
      return [...prev, { product: p, qty: 1 }]
    })
  }
  function changeQty(pid:number, q:number){
    setCart(prev => prev.map(i => i.product.id===pid ? {...i, qty:q} : i))
  }
  const total = cart.reduce((s,i)=> s + i.qty * i.product.price, 0)

  async function checkout(){
    if(cart.length===0) return
    await shop.sell(token!, cart.map(i => ({ productId: i.product.id, qty: i.qty, price: i.product.price })), 'Карта')
    toast.push('Продажа проведена')
    setCart([])
    await load()
  }

  return (
    <div className='grid lg:grid-cols-3 gap-4'>
      <div className='lg:col-span-2 card'>
        <div className='card-inner grid sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {items.map(p => (
            <div key={p.id} className='rounded-xl border border-border p-3 bg-surface'>
              <div className='font-semibold'>{p.name}</div>
              <div className='text-muted text-sm'>SKU: {p.sku || '-'}</div>
              <div className='mt-2 text-lg font-bold'>{p.price.toLocaleString('ru-RU')} ₽</div>
              <div className='text-muted text-sm'>Остаток: {p.qty}</div>
              <button className='btn mt-3 w-full' onClick={()=>addToCart(p)}>В корзину</button>
            </div>
          ))}
          {items.length===0 && <div className='text-center text-muted col-span-full py-10'>Склад пуст</div>}
        </div>
      </div>

      <div className='card'>
        <div className='card-inner space-y-3'>
          <div className='font-semibold'>Корзина</div>
          {cart.length===0 && <div className='text-muted'>Пусто</div>}
          {cart.map(c => (
            <div key={c.product.id} className='flex items-center justify-between gap-2'>
              <div className='text-sm'>{c.product.name}</div>
              <div className='flex items-center gap-2'>
                <input type='number' className='input w-20' value={c.qty} min={1} max={c.product.qty} onChange={e=>changeQty(c.product.id, Number(e.target.value))}/>
                <div className='w-24 text-right'>{(c.qty * c.product.price).toLocaleString('ru-RU')} ₽</div>
              </div>
            </div>
          ))}
          <div className='border-t border-border pt-3 flex items-center justify-between font-semibold'>
            <div>Итого</div><div>{total.toLocaleString('ru-RU')} ₽</div>
          </div>
          <button className='btn w-full' onClick={checkout} disabled={cart.length===0}>Оформить продажу</button>
        </div>
      </div>
    </div>
  )
}
