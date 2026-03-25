import { createContext, useContext, useMemo, useState } from 'react'

type ToastItem = { id: number; title: string; description?: string; destructive?: boolean }

type ToastContextType = {
  toasts: ToastItem[]
  toast: (input: { title: string; description?: string; variant?: 'destructive' }) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const value = useMemo<ToastContextType>(
    () => ({
      toasts,
      toast: ({ title, description, variant }) => {
        const id = Date.now() + Math.floor(Math.random() * 1000)
        setToasts((prev) => [{ id, title, description, destructive: variant === 'destructive' }, ...prev].slice(0, 3))
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== id))
        }, 2800)
      },
      dismiss: (id) => setToasts((prev) => prev.filter((item) => item.id !== id)),
    }),
    [toasts],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
