import { upsertPushSubscription } from '@/lib/codes-api'

/** 若缺少 VAPID 公钥，在控制台给出明确警告（需在构建时注入 VITE_VAPID_PUBLIC_KEY） */
export function warnIfVapidKeysMissingInClient(): void {
  const pub = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (typeof pub === 'string' && pub.trim()) return
  console.warn(
    '[NikkiCode] Web Push：未检测到有效的 VITE_VAPID_PUBLIC_KEY。无法在浏览器中调用 PushManager.subscribe；请在环境变量中配置 VAPID 公钥，并与服务器端的 VAPID_PRIVATE_KEY、VAPID_SUBJECT 成对使用。',
  )
}

export function isVapidPublicKeyConfigured(): boolean {
  const pub = import.meta.env.VITE_VAPID_PUBLIC_KEY
  return typeof pub === 'string' && pub.trim().length > 0
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/**
 * 请求通知权限、确保 Push 订阅并写入 Supabase push_subscriptions。
 * @returns 是否已具备可用的推送订阅（权限通过且订阅成功）
 */
export async function subscribePushAndPersist(reminderHours = 168): Promise<boolean> {
  warnIfVapidKeysMissingInClient()

  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey?.trim()) {
    throw new Error('缺少 VITE_VAPID_PUBLIC_KEY，无法订阅推送')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const rawKey = urlBase64ToUint8Array(vapidPublicKey.trim())
    const applicationServerKey = new Uint8Array(rawKey.byteLength)
    applicationServerKey.set(rawKey)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('订阅对象不完整，无法保存')
  }

  await upsertPushSubscription(
    {
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
    { reminderHours },
  )
  return true
}

/** 管理员「按兑换码精准推送」API（POST + 管理员密码） */
export function getCodePushApiUrl(): string {
  return new URL('api/send-push', `${window.location.origin}${import.meta.env.BASE_URL || '/'}`).toString()
}
