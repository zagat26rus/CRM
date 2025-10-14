import { ReactNode } from 'react'

export default function Modal({title, children, onClose}:{title:string; children:ReactNode; onClose:()=>void}){
  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='modal max-h-[90vh] overflow-auto' onClick={(e)=>e.stopPropagation()}>
        <div className='card-inner border-b border-border flex items-center justify-between'>
          <div className='modal-title'>{title}</div>
          <button onClick={onClose} className='btn ghost'>✕</button>
        </div>
        <div className='card-inner'>{children}</div>
      </div>
    </div>
  )
}
