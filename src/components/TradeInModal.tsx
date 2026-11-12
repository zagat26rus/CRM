import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import Select from './Select'
import ComboInput from './ComboInput'
import CashRegisterSelect from './CashRegisterSelect'
import ClientSuggestInput from './ClientSuggestInput'
import { apiFetch } from '../api'
import { useToast } from '../utils'
import { useDeviceCatalog } from '../hooks/useDeviceCatalog'
import { printTradeInDkp } from '../tradeinDkpPrint'
import { notifyBalanceChanged } from '../utils/balanceEvents'

type Warehouse = { id: number; name: string; isActive?: boolean }

const GRADES = [
  { id: 'A', label: 'A — отличное' },
  { id: 'B', label: 'B — хорошее' },
  { id: 'C', label: 'C — удовлетворительное' },
  { id: 'D', label: 'D — сильный износ / дефекты' },
]

const PAY_METHODS = [
  { id: 'cash', name: 'Наличные' },
  { id: 'card', name: 'Карта' },
  { id: 'bank', name: 'Перевод' },
  { id: 'online', name: 'Онлайн' },
]

export default function TradeInModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone?: () => void
}) {
  const toast = useToast()
  const catalog = useDeviceCatalog()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [saving, setSaving] = useState(false)
  const [printAfter, setPrintAfter] = useState(true)

  const [sellerName, setSellerName] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')
  const [sellerPassport, setSellerPassport] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [sellerEmail, setSellerEmail] = useState('')

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [memory, setMemory] = useState('')
  const [imei, setImei] = useState('')
  const [imei2, setImei2] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [equipment, setEquipment] = useState('Телефон, без зарядки')
  const [conditionGrade, setConditionGrade] = useState('B')
  const [conditionNotes, setConditionNotes] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [cashRegisterId, setCashRegisterId] = useState<number | ''>('')
  const [method, setMethod] = useState('cash')

  const brandOptions = useMemo(() => catalog.brandNames('Смартфон'), [catalog])
  const modelOptions = useMemo(
    () => catalog.modelNames('Смартфон', brand || undefined),
    [catalog, brand]
  )

  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiFetch('/inventory/warehouses')
        const data = await res.json().catch(() => [])
        const list = Array.isArray(data) ? data : []
        setWarehouses(list)
        const def = list.find((w: Warehouse) => (w as any).isDefault) || list[0]
        if (def) setWarehouseId(def.id)
      } catch {
        /* ignore */
      }
      void catalog.refreshContext({ deviceType: 'Смартфон' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    if (!sellerName.trim()) return toast.push('Укажите ФИО продавца')
    if (!sellerPassport.trim()) return toast.push('Укажите паспортные данные (нужны для ДКП)')
    if (!brand.trim() || !model.trim()) return toast.push('Укажите бренд и модель')
    if (!imei.trim() && !serialNumber.trim()) return toast.push('Укажите IMEI или серийный номер')
    const price = Number(buyPrice)
    if (!Number.isFinite(price) || price < 0) return toast.push('Укажите цену выкупа')

    setSaving(true)
    try {
      const res = await apiFetch('/tradein', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerName: sellerName.trim(),
          sellerPhone: sellerPhone.trim(),
          sellerPassport: sellerPassport.trim(),
          sellerAddress: sellerAddress.trim(),
          sellerEmail: sellerEmail.trim(),
          brand: brand.trim(),
          model: model.trim(),
          color: color.trim(),
          memory: memory.trim(),
          imei: imei.trim(),
          imei2: imei2.trim(),
          serialNumber: serialNumber.trim(),
          equipment: equipment.trim(),
          conditionGrade,
          conditionNotes: conditionNotes.trim(),
          buyPrice: price,
          salePrice: salePrice.trim() === '' ? undefined : Number(salePrice),
          warehouseId: warehouseId || undefined,
          cashRegisterId: cashRegisterId || undefined,
          method,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)

      toast.push(`Устройство принято на склад · ${data?.documentNumber || 'ДКП'}`)
      notifyBalanceChanged()
      if (printAfter && data?.docData) {
        try {
          printTradeInDkp(data.docData)
        } catch (e) {
          console.error(e)
          toast.push('Не удалось открыть печать ДКП')
        }
      }
      onDone?.()
      onClose()
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось принять устройство')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title='Принять устройство (trade-in)' onClose={onClose}>
      <div className='space-y-5'>
        <p className='text-sm text-muted'>
          Выкуп б/у телефона у клиента: создаётся позиция на складе, расход по кассе и договор купли-продажи (ДКП) для подписи.
        </p>

        <div className='p-4 rounded-xl border border-border bg-surface/40 space-y-3'>
          <div className='font-semibold text-sm'>Продавец (клиент)</div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <label className='label'>ФИО *</label>
              <ClientSuggestInput
                mode='name'
                value={sellerName}
                placeholder='ФИО как в паспорте'
                onChange={setSellerName}
                onSelect={(c) => {
                  setSellerName(c.name || '')
                  setSellerPhone(c.phone || '')
                  setSellerEmail(c.email || '')
                }}
              />
            </div>
            <div>
              <label className='label'>Телефон</label>
              <ClientSuggestInput
                mode='phone'
                value={sellerPhone}
                placeholder='+7...'
                minChars={3}
                onChange={setSellerPhone}
                onSelect={(c) => {
                  setSellerName(c.name || sellerName)
                  setSellerPhone(c.phone || '')
                  setSellerEmail(c.email || '')
                }}
              />
            </div>
            <div className='md:col-span-2'>
              <label className='label'>Паспортные данные *</label>
              <input
                className='input'
                value={sellerPassport}
                onChange={(e) => setSellerPassport(e.target.value)}
                placeholder='серия, номер, кем и когда выдан'
              />
            </div>
            <div className='md:col-span-2'>
              <label className='label'>Адрес регистрации</label>
              <input
                className='input'
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
                placeholder='как в паспорте'
              />
            </div>
          </div>
        </div>

        <div className='p-4 rounded-xl border border-border bg-surface/40 space-y-3'>
          <div className='font-semibold text-sm'>Устройство</div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <div>
              <label className='label'>Бренд *</label>
              <ComboInput value={brand} options={brandOptions} placeholder='Apple, Samsung…' onChange={setBrand} />
            </div>
            <div>
              <label className='label'>Модель *</label>
              <ComboInput value={model} options={modelOptions} placeholder='iPhone 13, Galaxy A55…' onChange={setModel} />
            </div>
            <div>
              <label className='label'>Память</label>
              <input className='input' value={memory} onChange={(e) => setMemory(e.target.value)} placeholder='128 GB' />
            </div>
            <div>
              <label className='label'>Цвет</label>
              <input className='input' value={color} onChange={(e) => setColor(e.target.value)} placeholder='чёрный' />
            </div>
            <div>
              <label className='label'>IMEI *</label>
              <input className='input font-mono' value={imei} onChange={(e) => setImei(e.target.value)} placeholder='15 цифр' />
            </div>
            <div>
              <label className='label'>IMEI 2</label>
              <input className='input font-mono' value={imei2} onChange={(e) => setImei2(e.target.value)} placeholder='если Dual SIM' />
            </div>
            <div>
              <label className='label'>S/N</label>
              <input className='input font-mono' value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div>
              <label className='label'>Комплектация</label>
              <input className='input' value={equipment} onChange={(e) => setEquipment(e.target.value)} />
            </div>
            <div>
              <label className='label'>Состояние</label>
              <Select className='select' value={conditionGrade} onChange={(e) => setConditionGrade(e.target.value)}>
                {GRADES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className='md:col-span-2'>
              <label className='label'>Дефекты и замечания</label>
              <textarea
                className='textarea'
                rows={2}
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                placeholder='Царапины, скол, не работает Face ID, следы влаги…'
              />
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <div>
            <label className='label'>Цена выкупа, ₽ *</label>
            <input className='input' type='number' min={0} step='0.01' value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
          </div>
          <div>
            <label className='label'>Цена продажи на складе, ₽</label>
            <input
              className='input'
              type='number'
              min={0}
              step='0.01'
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder='по умолчанию ≈ выкуп × 1.2'
            />
          </div>
          <div>
            <label className='label'>Склад</label>
            <Select
              className='select'
              value={warehouseId === '' ? '' : String(warehouseId)}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <CashRegisterSelect value={cashRegisterId} onChange={setCashRegisterId} label='Касса списания' showBalance />
          <div className='md:col-span-2'>
            <label className='label'>Способ выплаты клиенту</label>
            <div className='grid grid-cols-2 gap-2'>
              {PAY_METHODS.map((m) => (
                <button
                  key={m.id}
                  type='button'
                  className={`p-3 rounded-xl border transition ${
                    method === m.id ? 'border-primary text-primary bg-primary/10' : 'border-border hover:bg-surface'
                  }`}
                  onClick={() => setMethod(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className='flex items-center gap-2 cursor-pointer'>
          <input type='checkbox' checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />
          <span className='text-sm'>Печатать ДКП после сохранения</span>
        </label>

        <div className='flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-border'>
          <button className='btn secondary' onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button className='btn' onClick={submit} disabled={saving}>
            {saving ? 'Сохранение…' : 'Принять и оформить ДКП'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
