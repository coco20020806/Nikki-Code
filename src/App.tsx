import { useEffect } from 'react'
import { Route, Router as WouterRouter, Switch } from 'wouter'
import Dashboard from '@/pages/dashboard'
import Admin from '@/pages/admin'
import NotFound from '@/pages/not-found'
import { ToastProvider } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { fetchUrgentUnclaimedBadgeCount } from '@/lib/urgent-badge-count'

/**
 * 根据 Supabase 兑换码 + 本地已领取状态同步角标；不因「打开 App」无故清除。
 * 仅当计算数量为 0 时清除（已领完或过期后）。
 */
function usePersistedAppBadgeSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }

    const sync = () => {
      void (async () => {
        try {
          const count = await fetchUrgentUnclaimedBadgeCount()
          if (typeof nav.setAppBadge !== 'function') return
          if (count > 0) {
            await nav.setAppBadge(count).catch(() => {})
          } else if (typeof nav.clearAppBadge === 'function') {
            await nav.clearAppBadge().catch(() => {})
          }
        } catch {
          /* ignore */
        }
      })()
    }

    sync()
    window.addEventListener('nikki-badge-sync', sync)
    const onVis = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('nikki-badge-sync', sync)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  )
}

export default function App() {
  usePersistedAppBadgeSync()

  return (
    <ToastProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRouter />
      </WouterRouter>
      <Toaster />
    </ToastProvider>
  )
}
