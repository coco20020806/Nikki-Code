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
    return
  }
  if (event.data && event.data.type === 'SYNC_SERVER_SETTINGS') {
    const payload = event.data.payload
    void saveServerSettings(payload)
  }
})

async function saveServerSettings(settings) {
  const cache = await caches.open('nikki-runtime')
  await cache.put(
    new Request('https://nikki.local/__server_settings__'),
    new Response(JSON.stringify(settings ?? {}), {
      headers: { 'content-type': 'application/json' },
    }),
  )
}

async function readServerSettings() {
  try {
    const cache = await caches.open('nikki-runtime')
    const resp = await cache.match(new Request('https://nikki.local/__server_settings__'))
    if (!resp) return null
    return await resp.json()
  } catch (_) {
    return null
  }
}

function defaultServerByGame(gameName) {
  return gameName === '闪耀暖暖' ? 'SN_CN' : 'IN_CN'
}

function shouldNotifyByServerPreference(settings, gameName, server) {
  if (!gameName) return true
  const currentServer = server || defaultServerByGame(gameName)
  if (gameName === '闪耀暖暖') {
    const list = Array.isArray(settings?.shining) ? settings.shining : ['SN_CN']
    return list.includes(currentServer)
  }
  if (gameName === '无限暖暖') {
    const list = Array.isArray(settings?.infinity) ? settings.infinity : ['IN_CN']
    return list.includes(currentServer)
  }
  return true
}

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
      const gameName = data.gameName ? String(data.gameName) : ''
      const server = data.server ? String(data.server) : ''

      const settings = await readServerSettings()
      if (!shouldNotifyByServerPreference(settings, gameName, server)) {
        return
      }

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
