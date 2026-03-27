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

      /**
       * 自动推送也点亮红点：始终硬编码 setAppBadge(1)，不依赖 payload 里的数字字段。
       * 与 showNotification 并行，且整体在 event.waitUntil 内，避免 SW 提前被结束。
       */
      const badgeP = (async () => {
        if (typeof navigator === 'undefined' || !navigator.setAppBadge) {
          console.log('[NikkiCode SW] push: 无 setAppBadge，跳过角标')
          return
        }
        console.log('[NikkiCode SW] push: 调用前 → navigator.setAppBadge(1)（硬编码）')
        try {
          await navigator.setAppBadge(1)
          console.log('[NikkiCode SW] push: 调用后 → setAppBadge(1) 已成功')
        } catch (error) {
          console.error('[NikkiCode SW] push: 调用后 → setAppBadge(1) 失败', error)
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
