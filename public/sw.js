/* NikkiCode PWA — 处理推送并在系统层展示通知 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const DEFAULT_TITLE = '兑换码到期提醒'
const DEFAULT_BODY = '请打开应用查看兑换码与到期提醒'

self.addEventListener('push', (event) => {
  let title = DEFAULT_TITLE
  let body = DEFAULT_BODY
  let url = '/'

  if (event.data) {
    try {
      const payload = event.data.json()
      if (payload.title && String(payload.title).trim()) title = String(payload.title)
      if (payload.body != null && String(payload.body).trim()) body = String(payload.body)
      else if (payload.message != null && String(payload.message).trim()) body = String(payload.message)
      if (payload.url) url = String(payload.url)
    } catch {
      const text = event.data.text()
      if (text && String(text).trim()) body = String(text)
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

  const badge =
    typeof self.navigator !== 'undefined' && 'setAppBadge' in self.navigator
      ? self.navigator.setAppBadge(1).catch(() => {})
      : Promise.resolve()

  event.waitUntil(Promise.all([show, badge]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  const clearBadge =
    typeof self.navigator !== 'undefined' && 'clearAppBadge' in self.navigator
      ? self.navigator.clearAppBadge().catch(() => {})
      : Promise.resolve()

  const focusOrOpen = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
  })

  event.waitUntil(Promise.all([clearBadge, focusOrOpen]))
})
