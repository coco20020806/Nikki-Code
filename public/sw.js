/* NikkiCode PWA — 处理推送并在系统层展示通知 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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

      const showP = self.registration.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: { url },
        tag: 'nikki-push',
        renotify: true,
      })

      /** 无 payload 时也要设置角标，避免 SW 在角标完成前被回收 */
      const badgeP =
        typeof navigator !== 'undefined' && navigator.setAppBadge
          ? navigator.setAppBadge(1).catch((error) => {
              console.error('设置角标失败:', error)
            })
          : Promise.resolve()

      await Promise.all([showP, badgeP])
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      if (typeof navigator !== 'undefined' && navigator.clearAppBadge) {
        await navigator.clearAppBadge().catch(() => {})
      }
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
