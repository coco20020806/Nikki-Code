import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type CollapsibleSectionProps = {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  /** 标题栏右侧、箭头左侧的附加控件（如复选框） */
  headerExtra?: ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  headerExtra,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className={cn('glass-card overflow-hidden border-white/60 shadow-card', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
        <div className="flex shrink-0 items-center gap-3">
          {headerExtra ? (
            <span
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {headerExtra}
            </span>
          ) : null}
          <ChevronDown
            className={cn('h-5 w-5 text-muted-foreground transition-transform duration-300', open && 'rotate-180')}
            aria-hidden
          />
        </div>
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-6 pb-6 pt-0">{children}</div>
        </div>
      </div>
    </Card>
  )
}
