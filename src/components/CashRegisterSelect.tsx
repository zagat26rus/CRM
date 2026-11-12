import Select from './Select'
import { useCashRegisters } from '../hooks/useCashRegisters'

type Props = {
  value: number | '' 
  onChange: (id: number | '') => void
  label?: string
  className?: string
  allowEmpty?: boolean
  showBalance?: boolean
}

export default function CashRegisterSelect({
  value,
  onChange,
  label = 'Касса',
  className = 'select',
  allowEmpty = false,
  showBalance = false,
}: Props) {
  const { registers, loading, defaultId } = useCashRegisters()

  // Auto-pick default once loaded if empty
  const effective = value || (allowEmpty ? '' : defaultId || '')

  return (
    <div>
      <label className='label'>{label}</label>
      <Select
        className={className}
        value={effective === '' ? '' : String(effective)}
        disabled={loading || registers.length === 0}
        onChange={(e) => {
          const v = e.target.value
          onChange(v ? Number(v) : '')
        }}
      >
        {allowEmpty ? <option value=''>Все кассы</option> : null}
        {!allowEmpty && registers.length === 0 ? <option value=''>Нет касс</option> : null}
        {registers.map((r) => (
          <option key={r.id} value={String(r.id)}>
            {r.name}
            {r.isDefault ? ' · основная' : ''}
            {showBalance && r.balance != null ? ` · ${Number(r.balance).toLocaleString('ru-RU')} ₽` : ''}
          </option>
        ))}
      </Select>
      {!allowEmpty ? (
        <p className='text-xs text-muted mt-1'>Куда зачислить или списать платёж</p>
      ) : null}
    </div>
  )
}
