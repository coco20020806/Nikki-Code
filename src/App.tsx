import { useEffect } from 'react'
import { Route, Router as WouterRouter, Switch } from 'wouter'
import Dashboard from '@/pages/dashboard'
import Admin from '@/pages/admin'
import NotFound from '@/pages/not-found'
import { ToastProvider } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'

function useClearAppBadgeWhenVisible() {
  useEffect(() => {
    if (!('clearAppBadge' in navigator)) return

    const tryClear = () => {
      if (document.visibilityState !== 'visible') return
      void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
    }

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
