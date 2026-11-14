import Select from './Select'
import type { OrderCustomField } from '../utils/orderFormSchema'

type Props = {
  fields: OrderCustomField[]
  values: Record<string, any>
  onChange: (id: string, value: any) => void
  disabled?: boolean
  errorIds?: Set<string>
}

export default function CustomOrderFields({ fields, values, onChange, disabled = false, errorIds }: Props) {
  const visible = fields.filter((field) => field.visible)
  if (!visible.length) return null

  return (
    <div className='md:col-span-2 p-4 bg-surface rounded-xl border border-border'>
      <h3 className='font-semibold text-sm mb-3'>Дополнительные поля</h3>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {visible.map((field) => {
          const label = `${field.label}${field.required ? ' *' : ''}`
          const value = values[field.id]
          const invalidClass = errorIds?.has(field.id)
            ? 'ring-2 ring-danger border-danger rounded-xl p-2'
            : ''

          if (field.type === 'textarea') {
            return (
              <div key={field.id} className={`md:col-span-2 ${invalidClass}`}>
                <label className='label'>{label}</label>
                <textarea
                  className='textarea'
                  rows={3}
                  value={String(value ?? '')}
                  placeholder={field.placeholder}
                  disabled={disabled}
                  onChange={(e) => onChange(field.id, e.target.value)}
                />
              </div>
            )
          }

          if (field.type === 'select') {
            return (
              <div key={field.id} className={invalidClass}>
                <label className='label'>{label}</label>
                <Select
                  className='select'
                  value={String(value ?? '')}
                  disabled={disabled}
                  onChange={(e) => onChange(field.id, e.target.value)}
                >
                  <option value=''>Выберите вариант</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </div>
            )
          }

          if (field.type === 'radio') {
            return (
              <fieldset key={field.id} className={`md:col-span-2 ${invalidClass}`}>
                <legend className='label'>{label}</legend>
                <div className='flex flex-wrap gap-3'>
                  {field.options.map((option) => (
                    <label key={option} className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='radio'
                        name={`custom-${field.id}`}
                        checked={value === option}
                        disabled={disabled}
                        onChange={() => onChange(field.id, option)}
                      />
                      <span className='text-sm'>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          }

          if (field.type === 'checkbox') {
            return (
              <label key={field.id} className={`flex items-center gap-2 cursor-pointer self-end min-h-11 ${invalidClass}`}>
                <input
                  type='checkbox'
                  checked={Boolean(value)}
                  disabled={disabled}
                  onChange={(e) => onChange(field.id, e.target.checked)}
                />
                <span className='text-sm'>{label}</span>
              </label>
            )
          }

          if (field.type === 'multiselect') {
            const selected = Array.isArray(value) ? value : []
            return (
              <fieldset key={field.id} className={`md:col-span-2 ${invalidClass}`}>
                <legend className='label'>{label}</legend>
                <div className='flex flex-wrap gap-3'>
                  {field.options.map((option) => (
                    <label key={option} className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={selected.includes(option)}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selected, option]
                            : selected.filter((item: string) => item !== option)
                          onChange(field.id, next)
                        }}
                      />
                      <span className='text-sm'>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          }

          return (
            <div key={field.id} className={invalidClass}>
              <label className='label'>{label}</label>
              <input
                className='input'
                value={String(value ?? '')}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

