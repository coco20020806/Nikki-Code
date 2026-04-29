import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerNikkiServiceWorker } from '@/lib/register-sw'
import { warnIfVapidKeysMissingInClient } from '@/lib/push-notifications'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

registerNikkiServiceWorker()
warnIfVapidKeysMissingInClient()

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Analytics />
    <SpeedInsights />
  </>,
)
