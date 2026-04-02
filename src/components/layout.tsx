import type { ReactNode } from 'react'
import { Heart, Sparkles } from 'lucide-react'
import { Link } from 'wouter'
import { APP_VERSION } from '@/lib/app-version'
import { cn } from '@/lib/utils'

export function Layout({
  children,
  rightSlot,
  /** 底部固定横幅占位，避免主内容与页脚被遮挡 */
  bottomInsetPad = false,
}: {
  children: ReactNode
  rightSlot?: ReactNode
  bottomInsetPad?: boolean
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none fixed top-0 left-0 -z-10 h-full w-full">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[50%] w-[50%] rounded-full bg-secondary/15 blur-[120px]" />
      </div>

      <header className="glass-card sticky top-0 z-40 w-full border-b-0 shadow-sm">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-2 outline-none">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20 transition-all duration-300 group-hover:rotate-3 group-hover:scale-105">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-gradient font-display text-2xl leading-none font-extrabold tracking-tight">NikkiCode</span>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                为暖暖玩家用心制作 <Heart className="h-3 w-3 fill-primary text-primary" />
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4">{rightSlot}</nav>
        </div>
      </header>

      <div
        className={cn(
          'mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col',
          bottomInsetPad && 'pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        <main className="w-full flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">{children}</main>
        <footer className="w-full py-8 text-center text-sm font-medium text-muted-foreground">
          <p>及时获取最新兑换码福利</p>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground/80">
          NikkiCode · v{APP_VERSION} (Stable)
        </p>
        </footer>
      </div>
    </div>
  )
}
