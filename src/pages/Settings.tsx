import { useEffect, useState } from 'react'
import { catalogs, DeviceType, Brand, Model } from '../api'
import { useAuth } from '../store/auth'
import { Input } from '../components/Form'

export default function Settings(){
  const { token } = useAuth()
  const [types, setTypes] = useState<DeviceType[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [models, setModels] = useState<Model[]>([])

  const [typeName, setTypeName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [model, setModel] = useState({ brandId: 0, name: '' })

  async function load(){
    if(!token) return
    setTypes(await catalogs.types(token))
    const bs = await catalogs.brands(token); setBrands(bs)
    setModels(await catalogs.models(token))
  }
  useEffect(()=>{ load() },[token])

  async function addType(){ if(!typeName) return; await catalogs.addType(token!, typeName); setTypeName(''); await load() }
  async function addBrand(){ if(!brandName) return; await catalogs.addBrand(token!, brandName); setBrandName(''); await load() }
  async function addModel(){ if(!model.brandId || !model.name) return; await catalogs.addModel(token!, model.brandId, model.name); setModel({ brandId:0, name:'' }); await load() }

  return (
    <div className='grid lg:grid-cols-3 gap-4'>
      <div className='card'>
        <div className='card-inner space-y-3'>
          <div className='font-semibold'>Виды устройств</div>
          <div className='flex gap-2'>
            <Input value={typeName} onChange={e=>setTypeName(e.target.value)} placeholder='Добавить вид'/>
            <button className='btn' onClick={addType}>+</button>
          </div>
          <ul className='text-sm text-muted list-disc pl-5'>
            {types.map(t => <li key={t.id}>{t.name}</li>)}
          </ul>
        </div>
      </div>

      <div className='card'>
        <div className='card-inner space-y-3'>
          <div className='font-semibold'>Бренды</div>
          <div className='flex gap-2'>
            <Input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder='Добавить бренд'/>
            <button className='btn' onClick={addBrand}>+</button>
          </div>
          <ul className='text-sm text-muted list-disc pl-5'>
            {brands.map(b => <li key={b.id}>{b.name}</li>)}
          </ul>
        </div>
      </div>

      <div className='card'>
        <div className='card-inner space-y-3'>
          <div className='font-semibold'>Модели</div>
          <div className='grid grid-cols-3 gap-2'>
            <select className='select' value={model.brandId} onChange={e=>setModel({...model, brandId:Number(e.target.value)})}>
              <option value={0}>— бренд —</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <Input value={model.name} onChange={e=>setModel({...model, name:e.target.value})} placeholder='Модель'/>
            <button className='btn' onClick={addModel}>Добавить</button>
          </div>
          <ul className='text-sm text-muted list-disc pl-5 max-h-64 overflow-auto'>
            {models.map(m => <li key={m.id}>{m.name} <span className='opacity-60'>({brands.find(b=>b.id===m.brandId)?.name})</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
