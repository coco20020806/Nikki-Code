/* NikkiCode PWA — 处理推送并在系统层展示通知 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let title = 'NikkiCode'
  let body = '有新消息'
  let url = '/'
  const hasPushPayload = Boolean(event.data)

  if (event.data) {
    try {
      const payload = event.data.json()
      if (payload.title) title = String(payload.title)
      if (payload.body != null) body = String(payload.body)
      else if (payload.message != null) body = String(payload.message)
      if (payload.url) url = String(payload.url)
    } catch {
      const text = event.data.text()
      if (text) body = text
    }
  }

  const show = self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url },
    tag: 'nikki-push',
    renotify: true,
  })

  /** PWA 桌面/程序坞角标（需 Chromium 系等支持 Badging API） */
  const badge =
    hasPushPayload &&
    typeof self.navigator !== 'undefined' &&
    'setAppBadge' in self.navigator
      ? self.navigator.setAppBadge(1).catch(() => {})
      : Promise.resolve()

  event.waitUntil(Promise.all([show, badge]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
