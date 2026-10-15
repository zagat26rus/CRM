import { create } from 'zustand'

type Toast = { id: number; text: string }
type Store = {
  toasts: Toast[]
  push: (text: string) => void
  remove: (id: number) => void
}

const TOAST_TTL_MS = 2800

export const useToast = create<Store>((set, get) => ({
  toasts: [],
  push: (text) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => {
      get().remove(id)
    }, TOAST_TTL_MS)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}))

export function Toasts(){
  const { toasts, remove } = useToast()
  return (
    <div className='fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6 right-4 sm:right-6 space-y-2 z-40 pointer-events-none max-w-[calc(100vw-2rem)]'>
      {toasts.map(t => (
        <div
          key={t.id}
          role='status'
          className='toast pointer-events-auto cursor-pointer'
          onClick={() => remove(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
