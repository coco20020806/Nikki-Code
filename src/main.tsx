import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerNikkiServiceWorker } from '@/lib/register-sw'
import { warnIfVapidKeysMissingInClient } from '@/lib/push-notifications'

registerNikkiServiceWorker()
warnIfVapidKeysMissingInClient()

createRoot(document.getElementById('root')!).render(
  <App />,
)
