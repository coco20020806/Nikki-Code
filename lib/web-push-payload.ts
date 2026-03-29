/**
 * 与 Service Worker `push` 解析逻辑对齐的 JSON 负载（webpush.sendNotification 的字符串体）。
 * `api/push-all.ts` 与 `api/cron-push.ts` 必须保持字段一致。
 */
export type StandardPushPayloadOverrides = {
  title?: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  badgeCount?: number
}

export const DEFAULT_PUSH_TITLE = 'Cron 测试'
export const DEFAULT_PUSH_BODY = '这是定时任务发出的通知'

export function buildStandardPushPayload(overrides?: StandardPushPayloadOverrides): string {
  const o = overrides ?? {}
  return JSON.stringify({
    title: o.title ?? DEFAULT_PUSH_TITLE,
    body: o.body ?? DEFAULT_PUSH_BODY,
    url: o.url ?? '/',
    icon: o.icon ?? '/icon-192x192.png',
    badge: o.badge ?? '/icon-192x192.png',
    badgeCount: typeof o.badgeCount === 'number' && Number.isFinite(o.badgeCount) ? Math.floor(o.badgeCount) : 1,
  })
}
