/* NikkiCode PWA — v1.2.0 · Service Worker */
const CACHE_NAME = 'nikki-v1.2.0'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const hasActive = self.registration.active
      if (!hasActive) {
        await self.skipWaiting()
        return
      }
      /* 已有在跑的 SW：新版本进入 waiting，由页面提示「发现新版本」后再 SKIP_WAITING */
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k.startsWith('nikki-v') && k !== CACHE_NAME).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {}
      if (event.data) {
        try {
          data = event.data.json()
        } catch (error) {
          console.error('解析推送 JSON 失败:', error)
          try {
            const text = event.data.text()
            if (text && String(text).trim()) data = { body: String(text) }
          } catch (_) {
            /* ignore */
          }
        }
      }

      const title = (data.title && String(data.title).trim()) || '提醒'
      const body =
        (data.body != null && String(data.body).trim()) ||
        (data.message != null && String(data.message).trim()) ||
        '您有一个兑换码即将到期'
      const url = data.url ? String(data.url) : '/'
      const icon = (data.icon && String(data.icon).trim()) || '/apple-touch-icon.png'
      const badgeImg = (data.badge && String(data.badge).trim()) || icon

      const showP = self.registration.showNotification(title, {
        body,
        icon,
        badge: badgeImg,
        data: { url },
        tag: 'nikki-push',
        renotify: true,
      })

      const rawBc = data.badgeCount
      const badgeCount =
        typeof rawBc === 'number' && Number.isFinite(rawBc) ? Math.max(0, Math.floor(rawBc)) : 1

      const badgeP = (async () => {
        if (typeof navigator === 'undefined' || !navigator.setAppBadge) {
          return
        }
        try {
          await navigator.setAppBadge(badgeCount)
        } catch (error) {
          console.error('[NikkiCode SW] push: setAppBadge 失败', error)
        }
      })()

      await Promise.all([showP, badgeP])
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          await client.focus()
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
    })(),
  )
})
