import { ReactNode, useRef } from 'react'

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  // Close only if press started AND ended on the backdrop.
  // Prevents closing when selecting text inside and releasing outside the dialog.
  const overlayPressed = useRef(false)

  return (
    <div
      className='modal-overlay'
      onMouseDown={(e) => {
        overlayPressed.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (overlayPressed.current && e.target === e.currentTarget) onClose()
        overlayPressed.current = false
      }}
    >
      <div
        className='modal max-h-[90vh] overflow-auto'
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='card-inner border-b border-border flex items-center justify-between gap-3'>
          <div className='modal-title flex-1'>{title}</div>
          <button
            type='button'
            onClick={onClose}
            className='btn ghost icon min-w-[44px] min-h-[44px] flex-shrink-0 touch-manipulation'
            aria-label='Закрыть'
          >
            <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>
        </div>
        <div className='card-inner'>{children}</div>
      </div>
    </div>
  )
}
