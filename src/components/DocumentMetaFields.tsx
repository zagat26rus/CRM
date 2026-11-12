import type { ReactNode } from 'react'

type Props = {
  documentNumber: string
  documentDate: string
  onDocumentNumberChange: (value: string) => void
  onDocumentDateChange: (value: string) => void
  onAutoFill: () => void
  loading?: boolean
  extra?: ReactNode
}

export default function DocumentMetaFields({
  documentNumber,
  documentDate,
  onDocumentNumberChange,
  onDocumentDateChange,
  onAutoFill,
  loading = false,
  extra
}: Props) {
  return (
    <div className='card p-4'>
      <div className='flex flex-wrap items-end justify-between gap-3 mb-3'>
        <p className='text-xs text-muted'>
          Номер и дата подставляются автоматически. При необходимости измените вручную.
        </p>
        <button type='button' className='btn btn-ghost text-sm py-2 min-h-0' onClick={onAutoFill} disabled={loading}>
          {loading ? 'Загрузка…' : 'Подставить автоматически'}
        </button>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
        <div>
          <label className='label'>№ документа</label>
          <input
            className='input'
            value={documentNumber}
            placeholder='Напр. КВ-2026-0001'
            onChange={(e) => onDocumentNumberChange(e.target.value)}
          />
        </div>
        <div>
          <label className='label'>Дата</label>
          <input
            type='date'
            className='input'
            value={documentDate}
            onChange={(e) => onDocumentDateChange(e.target.value)}
          />
        </div>
        {extra}
      </div>
    </div>
  )
}
