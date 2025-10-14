import { useEffect, useState } from 'react'
import { clientsApi, Client } from '../api'
import { useAuth } from '../store/auth'
import { Input } from '../components/Form'

export default function Clients(){
  const { token } = useAuth()
  const [rows, setRows] = useState<Client[]>([])
  const [form, setForm] = useState<Partial<Client>>({ name:'', phone:'' })

  useEffect(()=>{ (async()=>{ if(!token) return; setRows(await clientsApi.list(token)) })() },[token])

  async function add(){
    if(!form.name) return
    const c = await clientsApi.add(token!, form)
    setRows([c, ...rows])
    setForm({ name:'', phone:'' })
  }

  return (
    <div className='space-y-4'>
      <div className='card'>
        <div className='card-inner grid md:grid-cols-3 gap-3'>
          <label className='block'><span className='label'>Имя</span><Input value={form.name||''} onChange={e=>setForm({...form, name:e.target.value})}/></label>
          <label className='block'><span className='label'>Телефон</span><Input value={form.phone||''} onChange={e=>setForm({...form, phone:e.target.value})}/></label>
          <div className='flex items-end'><button className='btn' onClick={add}>Добавить клиента</button></div>
        </div>
      </div>

      <div className='card overflow-auto'>
        <table className='table min-w-[700px]'>
          <thead><tr><th>ID</th><th>Имя</th><th>Телефон</th><th>Email</th><th>Создан</th></tr></thead>
          <tbody>
            {rows.map(c => <tr key={c.id}><td>#{c.id}</td><td>{c.name}</td><td className='text-muted'>{c.phone||'-'}</td><td className='text-muted'>{c.email||'-'}</td><td className='text-muted'>{new Date(c.createdAt).toLocaleDateString()}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
