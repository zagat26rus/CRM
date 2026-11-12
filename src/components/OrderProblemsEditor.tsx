import Select from './Select'

export type ProblemLine = {
  problemName: string
  problemDescription?: string
  price: number
  costPrice: number
  problemId?: number | null
}

export default function OrderProblemsEditor({
  lines,
  onChange,
  issueOptions = [],
}: {
  lines: ProblemLine[]
  onChange: (lines: ProblemLine[]) => void
  issueOptions?: string[]
}) {
  const totalPrice = lines.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const totalCost = lines.reduce((s, l) => s + (Number(l.costPrice) || 0), 0)

  function update(index: number, patch: Partial<ProblemLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function addLine(name = '') {
    onChange([...lines, { problemName: name, price: 0, costPrice: 0, problemDescription: '' }])
  }

  function removeLine(index: number) {
    const next = lines.filter((_, i) => i !== index)
    onChange(next.length ? next : [{ problemName: '', price: 0, costPrice: 0 }])
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Неисправности</h3>
        <button type='button' className='btn secondary text-xs' onClick={() => addLine()}>
          + Ещё неисправность
        </button>
      </div>
      <p className='text-xs text-muted'>Можно добавить несколько работ: дисплей, аккумулятор и т.д.</p>

      <div className='space-y-3'>
        {lines.map((line, index) => (
          <div key={index} className='p-3 rounded-xl border border-border bg-bg space-y-2'>
            <div className='flex items-start justify-between gap-2'>
              <div className='text-xs text-muted'>Работа {index + 1}</div>
              {lines.length > 1 ? (
                <button type='button' className='btn ghost text-danger text-xs px-2 py-1' onClick={() => removeLine(index)}>
                  Удалить
                </button>
              ) : null}
            </div>
            <div>
              <label className='label'>Неисправность *</label>
              <input
                className='input'
                list={`issue-options-${index}`}
                value={line.problemName}
                onChange={(e) => update(index, { problemName: e.target.value })}
                placeholder='Замена дисплея, аккумулятора…'
              />
              {issueOptions.length > 0 ? (
                <datalist id={`issue-options-${index}`}>
                  {issueOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              ) : null}
              {issueOptions.length > 0 ? (
                <Select
                  className='select mt-2'
                  value=''
                  onChange={(e) => {
                    if (e.target.value) update(index, { problemName: e.target.value })
                  }}
                >
                  <option value=''>Выбрать из списка…</option>
                  {issueOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            <div>
              <label className='label'>Комментарий</label>
              <input
                className='input'
                value={line.problemDescription || ''}
                onChange={(e) => update(index, { problemDescription: e.target.value })}
                placeholder='Оригинал / копия, цвет…'
              />
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div>
                <label className='label'>Цена, ₽</label>
                <input
                  type='number'
                  className='input'
                  min={0}
                  step='0.01'
                  value={line.price || ''}
                  onChange={(e) => update(index, { price: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className='label'>Себест., ₽</label>
                <input
                  type='number'
                  className='input'
                  min={0}
                  step='0.01'
                  value={line.costPrice || ''}
                  onChange={(e) => update(index, { costPrice: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className='grid grid-cols-2 gap-2 p-3 rounded-xl bg-surface border border-border text-sm'>
        <div>
          <div className='text-xs text-muted'>Итого клиенту</div>
          <div className='font-semibold'>{totalPrice.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div>
          <div className='text-xs text-muted'>Себестоимость</div>
          <div className='font-semibold'>{totalCost.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>
    </div>
  )
}

export function sumProblemLines(lines: ProblemLine[]) {
  return {
    price: lines.reduce((s, l) => s + (Number(l.price) || 0), 0),
    costPrice: lines.reduce((s, l) => s + (Number(l.costPrice) || 0), 0),
    problem: lines.find((l) => l.problemName.trim())?.problemName.trim() || '',
  }
}
