import { create } from 'zustand'

type Toast = { id: number; text: string }
type Store = {
  toasts: Toast[]
  push: (text: string) => void
  remove: (id: number) => void
}

export const useToast = create<Store>((set) => ({
  toasts: [],
  push: (text) => set((s) => ({ toasts: [...s.toasts, { id: Date.now(), text }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}))

export function Toasts(){
  const { toasts, remove } = useToast()
  return (
    <div className='fixed bottom-6 right-6 space-y-2 z-50'>
      {toasts.map(t => (
        <div key={t.id} className='toast'>{t.text}</div>
      ))}
    </div>
  )
}
