import ComboInput from './ComboInput'
import Select from './Select'
import { RECEPTION_ADDRESSES } from '../constants/addresses'
import { SALE_CATEGORIES } from '../utils/saleCategories'
import type { useDeviceCatalog } from '../hooks/useDeviceCatalog'
import type { DocField, DocLine, DocSchema, GenericDocData } from '../documentFormSchemas'
import { calcLinesTotal, calcLinesCost, calcLinesProfit, calcDocTotal, calcDocCost, calcDocProfit, schemaHasFinance, emptyLine } from '../documentFormSchemas'

type DeviceCatalog = ReturnType<typeof useDeviceCatalog>

type Props = {
  schema: DocSchema
  data: GenericDocData
  onChange: (data: GenericDocData) => void
  deviceCatalog?: DeviceCatalog
}

function setField(data: GenericDocData, key: keyof GenericDocData, value: string | number) {
  const next = { ...data, [key]: value }
  if (key === 'client') {
    const clientName = String(value).trim()
    if (clientName && (!String(next.receivedBy || '').trim() || next.receivedBy === data.client)) {
      next.receivedBy = clientName
    }
  }
  return next
}

function FieldInput({
  field,
  data,
  onChange,
  deviceCatalog
}: {
  field: DocField
  data: GenericDocData
  onChange: (d: GenericDocData) => void
  deviceCatalog?: DeviceCatalog
}) {
  const val = data[field.key]
  const strVal = String(val ?? '')

  if (field.type === 'textarea') {
    return (
      <textarea
        className='textarea'
        rows={3}
        value={strVal}
        placeholder={field.placeholder}
        onChange={(e) => onChange(setField(data, field.key, e.target.value))}
      />
    )
  }

  if (field.type === 'number') {
    const isCost = field.key === 'costAmount'
    return (
      <input
        type='number'
        className={isCost
          ? 'input border-2 border-primary/80 bg-surface min-h-[44px] focus:border-primary placeholder:text-muted/70'
          : 'input'}
        min={0}
        step='0.01'
        placeholder={isCost ? '0' : undefined}
        value={isCost && !val ? '' : strVal}
        title={isCost ? 'Введите себестоимость — только для CRM' : undefined}
        onChange={(e) => onChange(setField(data, field.key, Number(e.target.value) || 0))}
      />
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <Select className='select' value={strVal} onChange={(e) => onChange(setField(data, field.key, e.target.value))}>
        {field.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    )
  }

  if (field.type === 'address') {
    return (
      <div>
        <ComboInput
          className='w-full'
          value={strVal}
          options={RECEPTION_ADDRESSES}
          placeholder='Выберите из списка или введите адрес'
          onChange={(v) => onChange(setField(data, field.key, v))}
        />
        <p className='text-xs text-muted mt-1'>Можно выбрать из списка или ввести вручную</p>
      </div>
    )
  }

  if (field.type === 'deviceType' && deviceCatalog) {
    return (
      <div>
        <Select
          className='select'
          value={strVal || 'Смартфон'}
          onChange={(e) => onChange(setField(data, field.key, e.target.value))}
        >
          {deviceCatalog.deviceTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>
    )
  }

  if (field.type === 'brand' && deviceCatalog) {
    return (
      <div>
        <ComboInput
          className='w-full'
          value={strVal}
          options={deviceCatalog.brandNames(data.deviceType || undefined)}
          placeholder='Выберите марку или введите'
          onChange={(v) => onChange(setField(data, field.key, v))}
        />
        <p className='text-xs text-muted mt-1'>Каталог с сайта и админки</p>
      </div>
    )
  }

  if (field.type === 'model' && deviceCatalog) {
    return (
      <div>
        <ComboInput
          className='w-full'
          value={strVal}
          options={deviceCatalog.modelNames(data.deviceType || undefined, data.brand || undefined)}
          placeholder='Выберите модель или введите'
          onChange={(v) => onChange(setField(data, field.key, v))}
        />
        <p className='text-xs text-muted mt-1'>Список зависит от типа и марки</p>
      </div>
    )
  }

  return (
    <input
      className='input'
      value={strVal}
      placeholder={field.placeholder}
      onChange={(e) => onChange(setField(data, field.key, e.target.value))}
    />
  )
}

function colWidth(key: string): string | undefined {
  if (key === 'name') return undefined
  if (key === 'unit') return '72px'
  if (key === 'qty') return '88px'
  if (key === 'price') return '120px'
  if (key === 'supplierCost') return '168px'
  if (key === 'vat') return '96px'
  return '100px'
}

function isNumericLineKey(key: string) {
  return key === 'qty' || key === 'price' || key === 'supplierCost'
}

function lineInputValue(line: DocLine, key: keyof DocLine): string {
  const raw = line[key]
  if (key === 'supplierCost') {
    return raw === undefined || raw === null || raw === '' ? '' : String(raw)
  }
  if (isNumericLineKey(key)) {
    return raw === undefined || raw === null ? '' : String(raw)
  }
  return String(raw ?? '')
}

function lineInputClass(key: string, crmOnly?: boolean) {
  const base = 'input py-2 min-h-[40px] w-full min-w-0 text-sm'
  if (key === 'supplierCost' || crmOnly) {
    return `${base} border-2 border-primary/80 bg-surface shadow-[inset_0_0_0_1px_rgba(255,193,7,0.15)] focus:border-primary placeholder:text-muted/70`
  }
  return base
}

function LinesEditor({
  data,
  columns,
  onChange
}: {
  data: GenericDocData
  columns: NonNullable<DocSchema['lineColumns']>
  onChange: (d: GenericDocData) => void
}) {
  const total = calcLinesTotal(data.lines)
  const costTotal = calcLinesCost(data.lines)
  const profit = calcLinesProfit(data.lines)
  const hasSupplierCost = columns.some((c) => c.key === 'supplierCost')

  function updateLine(i: number, patch: Partial<DocLine>) {
    const lines = data.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    onChange({ ...data, lines })
  }

  return (
    <div className='space-y-3'>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm table-fixed min-w-[760px]'>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={colWidth(c.key) ? { width: colWidth(c.key) } : undefined} />
            ))}
            <col style={{ width: '132px' }} />
            <col style={{ width: '40px' }} />
          </colgroup>
          <thead>
            <tr className='text-left text-muted border-b border-border'>
              {columns.map((c) => (
                <th key={c.key} className={`py-2 pr-2 font-medium truncate ${c.crmOnly ? 'text-primary' : ''}`}>
                  {c.label}
                  {c.crmOnly ? <span className='block text-[10px] font-normal text-muted normal-case'>поле ввода</span> : null}
                </th>
              ))}
              <th className='py-2 pr-2 font-medium text-right'>Сумма</th>
              <th className='py-2' />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) => {
              const lineSum = (Number(line.qty) || 0) * (Number(line.price) || 0)
              return (
              <tr key={i} className='border-b border-border/50'>
                {columns.map((c) => (
                  <td key={c.key} className='py-2 pr-2 align-top'>
                    <input
                      className={lineInputClass(c.key, c.crmOnly)}
                      type={isNumericLineKey(c.key) ? 'number' : 'text'}
                      min={isNumericLineKey(c.key) ? 0 : undefined}
                      step={c.key === 'supplierCost' || c.key === 'price' ? '0.01' : c.key === 'qty' ? '1' : undefined}
                      placeholder={isNumericLineKey(c.key) ? '0' : undefined}
                      value={lineInputValue(line, c.key)}
                      onChange={(e) =>
                        updateLine(i, {
                          [c.key]: isNumericLineKey(c.key) ? Number(e.target.value) || 0 : e.target.value
                        })
                      }
                      title={c.crmOnly ? 'Введите себестоимость — только для CRM' : undefined}
                      aria-label={c.crmOnly ? 'Себестоимость позиции' : c.label}
                    />
                  </td>
                ))}
                <td className='py-2 pr-2 align-top text-right tabular-nums whitespace-nowrap overflow-hidden text-ellipsis' title={`${lineSum.toLocaleString('ru-RU')} ₽`}>
                  {lineSum.toLocaleString('ru-RU')} ₽
                </td>
                <td className='py-2 align-top'>
                  {data.lines.length > 1 && (
                    <button type='button' className='btn btn-ghost text-xs py-1 min-h-0 px-2' onClick={() => onChange({ ...data, lines: data.lines.filter((_, idx) => idx !== i) })}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <button type='button' className='btn btn-ghost text-sm' onClick={() => onChange({ ...data, lines: [...data.lines, emptyLine()] })}>
          + Добавить строку
        </button>
        <div className='text-sm ml-auto space-y-1 text-right'>
          <div className='font-medium tabular-nums whitespace-nowrap'>Итого: {total.toLocaleString('ru-RU')} ₽</div>
          {hasSupplierCost && (
            <>
              <div className='text-muted tabular-nums whitespace-nowrap'>Себестоимость: {costTotal.toLocaleString('ru-RU')} ₽</div>
              <div className={`font-semibold tabular-nums whitespace-nowrap ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                Чистая прибыль: {profit.toLocaleString('ru-RU')} ₽
              </div>
            </>
          )}
        </div>
      </div>
      {hasSupplierCost && (
        <p className='text-xs text-muted'>
          <span className='text-primary font-medium'>Себестоимость вводится в жёлтом поле</span> в колонке таблицы (на каждую позицию).
          В печатной форме для клиента — только наименование, цена и сумма.
        </p>
      )}
    </div>
  )
}

function DocumentFinanceFooter({ data, schema }: { data: GenericDocData; schema: DocSchema }) {
  if (!schemaHasFinance(schema)) return null
  const hasLineCost = schema.lineColumns?.some((c) => c.key === 'supplierCost')
  const revenue = calcDocTotal(data)
  const cost = calcDocCost(data)
  const profit = calcDocProfit(data)

  if (!hasLineCost) {
    return (
      <div className='card p-4 border-primary/20 bg-primary/5'>
        <h2 className='font-semibold mb-3'>Финансы (только CRM)</h2>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm'>
          <div className='p-3 rounded-xl bg-surface/50'>
            <div className='text-muted'>Оборот / выручка</div>
            <div className='font-bold text-lg tabular-nums'>{revenue.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className='p-3 rounded-xl bg-surface/50'>
            <div className='text-muted'>Себестоимость / расходы</div>
            <div className='font-bold text-lg tabular-nums'>{cost.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className='p-3 rounded-xl bg-surface/50'>
            <div className='text-muted'>Чистая прибыль</div>
            <div className={`font-bold text-lg tabular-nums ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
              {profit.toLocaleString('ru-RU')} ₽
            </div>
          </div>
        </div>
        <p className='text-xs text-muted mt-3'>При печати документа суммы попадут в раздел «Платежи» для учёта оборота и прибыли.</p>
      </div>
    )
  }

  return null
}

export default function GenericDocumentForm({ schema, data, onChange, deviceCatalog }: Props) {
  return (
    <div className='space-y-4'>
      {schemaHasFinance(schema) && (
        <div className='card p-4 border-primary/20'>
          <label className='label'>Категория для аналитики (Тренды)</label>
          <Select
            className='select'
            value={data.saleCategory || 'tech'}
            onChange={(e) => onChange({ ...data, saleCategory: e.target.value as GenericDocData['saleCategory'] })}
          >
            {SALE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <p className='text-xs text-muted mt-1'>Попадёт в раздел «Тренды» после печати документа</p>
        </div>
      )}
      {schema.sections.map((section) => (
        <div key={section.title} className='card p-4'>
          <h2 className='font-semibold mb-3'>{section.title}</h2>
          {section.title === 'Подписи' && (
            <p className='text-xs text-muted mb-3'>
              Должность и ФИО попадут в печатный чек. Строки «подпись» остаются пустыми для подписания вручную.
            </p>
          )}
          {section.fields && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              {section.fields.map((field) => (
                <div key={field.key} className={field.colSpan === 2 ? 'md:col-span-2' : ''}>
                  <label className='label'>
                    {field.label}{field.required ? ' *' : ''}
                  </label>
                  <FieldInput field={field} data={data} onChange={onChange} deviceCatalog={deviceCatalog} />
                  {field.key === 'costAmount' && (
                    <p className='text-xs text-muted mt-1'>Необязательно. Учитывается в CRM для расчёта чистой прибыли, в печать не попадает.</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {section.showLines && schema.lineColumns && (
            <LinesEditor data={data} columns={schema.lineColumns} onChange={onChange} />
          )}
        </div>
      ))}
      <DocumentFinanceFooter data={data} schema={schema} />
    </div>
  )
}
