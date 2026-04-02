import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const DEFAULT_PUSH_TITLE = 'Cron 测试'
const DEFAULT_PUSH_BODY = '这是定时任务发出的通知'
const DEFAULT_ICON = '/apple-touch-icon.png'

type PushPayloadFields = {
  title?: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  badgeCount?: number
}

function buildStandardPushPayload(overrides?: PushPayloadFields): string {
  const o = overrides ?? {}
  return JSON.stringify({
    title: o.title ?? DEFAULT_PUSH_TITLE,
    body: o.body ?? DEFAULT_PUSH_BODY,
    url: o.url ?? '/',
    icon: o.icon ?? DEFAULT_ICON,
    badge: o.badge ?? DEFAULT_ICON,
    badgeCount:
      typeof o.badgeCount === 'number' && Number.isFinite(o.badgeCount) ? Math.floor(o.badgeCount) : 1,
  })
}

type PushRow = {
  endpoint: string
  p256dh: string
  auth_key: string
}

function logWebPushError(context: string, endpointPrefix: string, err: unknown): void {
  const base: Record<string, unknown> = {
    context,
    endpoint: endpointPrefix,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  }
  if (err && typeof err === 'object') {
    const o = err as { statusCode?: number; body?: string; headers?: unknown }
    if (o.statusCode != null) base.statusCode = o.statusCode
    if (o.body != null) base.body = o.body
    if (o.headers != null) base.headers = o.headers
  }
  console.error('[push-all] webpush 发送失败', base)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    const expectedPassword = process.env.VITE_ADMIN_PASSWORD
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string
      title?: string
      body?: string
      url?: string
      icon?: string
      badge?: string
      badgeCount?: number
    }

    if (!expectedPassword || body.password !== expectedPassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
    const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim()
    const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@localhost').trim()

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: '缺少 Supabase 服务端配置' })
    }
    if (!publicKey || !privateKey) {
      return res.status(500).json({ error: '缺少 VAPID 密钥' })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: rows, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')

    if (dbError) return res.status(500).json({ error: dbError.message })

    const subs = (rows ?? []) as PushRow[]
    const valid = subs.filter((s) => s.endpoint && s.p256dh && s.auth_key)

    const overrides: PushPayloadFields = {
      title: body.title,
      body: body.body,
      url: body.url,
      icon: body.icon,
      badge: body.badge,
      badgeCount: body.badgeCount,
    }
    const payload = buildStandardPushPayload(overrides)

    webpush.setVapidDetails(subject, publicKey, privateKey)

    let sent = 0
    let failed = 0
    for (const sub of valid) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
          { TTL: 3600 },
        )
        sent += 1
      } catch (e: unknown) {
        failed += 1
        logWebPushError('push-all', sub.endpoint.slice(0, 80), e)
      }
    }

    return res.status(200).json({ ok: true, total: valid.length, sent, failed })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '失败'
    console.error('[push-all]', e)
    return res.status(500).json({ error: message })
  }
}
