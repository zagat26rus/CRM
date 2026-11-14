import Select from './Select'

type PaymentMethod = { value: string; label: string }

type Props = {
  prepayment: string | number
  estimatedPrice: string | number
  costPrice: string | number
  price: string | number
  paymentMethod: string
  warranty: boolean
  onSite: boolean
  onPrepaymentChange: (value: string) => void
  onEstimatedPriceChange: (value: string) => void
  onCostPriceChange: (value: string) => void
  onPriceChange: (value: string) => void
  onPaymentMethodChange: (value: string) => void
  onWarrantyChange: (checked: boolean) => void
  onOnSiteChange: (checked: boolean) => void
  paymentMethods: PaymentMethod[]
}

export default function OrderPricingFields({
  prepayment,
  estimatedPrice,
  costPrice,
  price,
  paymentMethod,
  warranty,
  onSite,
  onPrepaymentChange,
  onEstimatedPriceChange,
  onCostPriceChange,
  onPriceChange,
  onPaymentMethodChange,
  onWarrantyChange,
  onOnSiteChange,
  paymentMethods,
}: Props) {
  const clientPrice = Number(price) || 0
  const partsCost = Number(costPrice) || 0
  const profit = clientPrice - partsCost

  return (
    <div className='md:col-span-2 p-4 bg-surface rounded-xl border border-border space-y-4'>
      <h3 className='font-semibold text-sm'>Стоимость и оплата</h3>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        <div>
          <label className='label'>Предоплата, ₽</label>
          <input
            type='number'
            className='input'
            value={prepayment || ''}
            onChange={(e) => onPrepaymentChange(e.target.value)}
            placeholder='0'
          />
        </div>
        <div>
          <label className='label'>Ориентировочная стоимость, ₽</label>
          <input
            type='number'
            className='input'
            value={estimatedPrice || ''}
            onChange={(e) => onEstimatedPriceChange(e.target.value)}
            placeholder='0'
          />
        </div>
        <div>
          <label className='label'>Себестоимость, ₽</label>
          <input
            type='number'
            className='input'
            value={costPrice || ''}
            onChange={(e) => onCostPriceChange(e.target.value)}
            placeholder='0'
          />
        </div>
        <div>
          <label className='label'>Стоимость для клиента, ₽</label>
          <input
            type='number'
            className='input'
            value={price || ''}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder='0'
          />
        </div>
        <div>
          <label className='label'>Способ оплаты</label>
          <Select className='select' value={paymentMethod} onChange={(e) => onPaymentMethodChange(e.target.value)}>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </div>
        <div className='flex gap-4 items-center flex-wrap'>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={warranty}
              onChange={(e) => onWarrantyChange(e.target.checked)}
              className='rounded border-border'
            />
            <span className='text-sm'>Гарантийный</span>
          </label>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={onSite}
              onChange={(e) => onOnSiteChange(e.target.checked)}
              className='rounded border-border'
            />
            <span className='text-sm'>Выездной</span>
          </label>
        </div>
      </div>
      <div className='flex justify-between items-center pt-1 border-t border-border'>
        <span className='text-sm text-muted'>Прибыль:</span>
        <span className={`font-bold ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
          {profit.toLocaleString('ru-RU')} ₽
        </span>
      </div>
    </div>
  )
}
