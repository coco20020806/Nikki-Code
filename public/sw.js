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
      const icon = (data.icon && String(data.icon).trim()) || '/icon-192x192.png'
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
          console.log('[NikkiCode SW] push: 无 setAppBadge，跳过角标')
          return
        }
        console.log('[NikkiCode SW] push: 调用前 → navigator.setAppBadge', badgeCount)
        try {
          await navigator.setAppBadge(badgeCount)
          console.log('[NikkiCode SW] push: 调用后 → setAppBadge 已完成')
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
