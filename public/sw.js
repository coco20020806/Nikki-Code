/* NikkiCode PWA — 处理推送并在系统层展示通知 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // 1. 获取推送数据（无数据或非 JSON 时退化为空对象 / 纯文本 body）
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

  const badgeCount =
    typeof data.badgeCount === 'number' && Number.isFinite(data.badgeCount) && data.badgeCount >= 0
      ? Math.floor(data.badgeCount)
      : 1

  // 2. 显示文字通知（icon / badge 使用 PNG，通知栏小图标更稳）
  const promiseChain = self.registration.showNotification(title, {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url },
    tag: 'nikki-push',
    renotify: true,
  })

  // 3. 桌面 / 程序坞角标（数字可由 data.badgeCount 指定，默认 1）
  let badgePromise = Promise.resolve()
  if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
    badgePromise = navigator.setAppBadge(badgeCount).catch((error) => {
      console.error('设置角标失败:', error)
    })
  }

  event.waitUntil(Promise.all([promiseChain, badgePromise]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  const clearBadge =
    typeof navigator !== 'undefined' && navigator.clearAppBadge
      ? navigator.clearAppBadge().catch(() => {})
      : Promise.resolve()

  const focusOrOpen = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
  })

  event.waitUntil(Promise.all([clearBadge, focusOrOpen]))
})
