import { useEffect } from 'react'
import { Route, Router as WouterRouter, Switch } from 'wouter'
import Dashboard from '@/pages/dashboard'
import Admin from '@/pages/admin'
import NotFound from '@/pages/not-found'
import { ToastProvider } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'

function useClearAppBadgeWhenVisible() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.clearAppBadge) return

    const nav = navigator as Navigator & { clearAppBadge: () => Promise<void> }

    /** App 进入前台或首次挂载时清除角标（用户已看到应用） */
    const tryClear = () => {
      if (document.visibilityState !== 'visible') return
      void nav.clearAppBadge().catch(() => {})
    }

    void nav.clearAppBadge().catch(() => {})
    tryClear()
    document.addEventListener('visibilitychange', tryClear)
    return () => document.removeEventListener('visibilitychange', tryClear)
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
  useClearAppBadgeWhenVisible()

  return (
    <ToastProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRouter />
      </WouterRouter>
      <Toaster />
    </ToastProvider>
  )
}
