import { X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-3">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`rounded-2xl border p-4 shadow-xl ${
            item.destructive ? 'border-destructive/40 bg-destructive/10' : 'border-primary/25 bg-white'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground">{item.title}</p>
              {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
              {item.action ? (
                <button
                  type="button"
                  className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.98]"
                  onClick={() => {
                    item.action?.onClick()
                    dismiss(item.id)
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-muted-foreground transition hover:bg-black/5 hover:text-foreground"
              onClick={() => dismiss(item.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
