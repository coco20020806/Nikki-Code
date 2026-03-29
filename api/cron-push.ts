import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * 与 Cron 间隔配合：剩余过期时间在 (R - 下沿, R + 上沿] 内视为命中用户选择的「提前 R 小时提醒」
 * R = push_subscriptions.reminder_hours（1 / 6 / 12 / 24，默认 24）
 */
const MATCH_WINDOW_HOURS = 1.5
const MATCH_UPPER_SLACK_HOURS = 0.5

/** 与 api/push-all.ts 中 buildStandardPushPayload 一致（供 Service Worker JSON 解析） */
const DEFAULT_PUSH_TITLE = 'Cron 测试'
const DEFAULT_PUSH_BODY = '这是定时任务发出的通知'
const DEFAULT_ICON = '/icon-192x192.png'

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

type CodeRow = {
  id: number
  code_text: string
  expiry_at: string
}

type SubRow = {
  endpoint: string
  p256dh: string
  auth_key: string
  reminder_hours: number | null
}

function parseExpiryMs(expiryAt: string): number | null {
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(expiryAt)
  const normalized = hasTz ? expiryAt : `${expiryAt}+08:00`
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? null : ms
}

function warnIfServerVapidMissing(): void {
  const pub = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) {
    console.warn('[NikkiCode cron-push] 缺少 VAPID 公钥/私钥，无法发送推送')
  }
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
  console.error('[cron-push] webpush 发送失败', base)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = (process.env.CRON_SECRET || '').trim()
  const auth = (req.headers.authorization || '').trim()
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const serverNowUtc = new Date().toISOString()
  console.log('[cron-push] 服务器当前时间 (UTC):', serverNowUtc)

  warnIfServerVapidMissing()

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

  const now = Date.now()

  console.log(
    `[cron-push] 匹配规则：每条订阅使用 push_subscriptions.reminder_hours（1/6/12/24，默认 24）；` +
      `若码的「剩余小时数」落在 (R-${MATCH_WINDOW_HOURS}h, R+${MATCH_UPPER_SLACK_HOURS}h] 则推送`,
  )

  const { data: codeRows, error: codesError } = await supabase
    .from('codes')
    .select('id, code_text, expiry_at')
    .eq('is_invalid', false)
    .not('expiry_at', 'is', null)

  if (codesError) {
    console.error('[cron-push] codes 查询失败', codesError.message)
    return res.status(500).json({ error: codesError.message })
  }

  /** 仅「尚未过期」的兑换码（过期时间 > 当前时刻） */
  const activeCodes = (codeRows ?? []).filter((c) => {
    const ms = parseExpiryMs((c as CodeRow).expiry_at)
    return ms !== null && ms > now
  }) as CodeRow[]

  const codeIds = activeCodes.map((c) => c.id)
  console.log(`[cron-push] Found ${activeCodes.length} active codes (expiry > now, UTC comparison via parse)`)

  const { data: subRows, error: subError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key, reminder_hours')

  if (subError) {
    console.error('[cron-push] push_subscriptions 查询失败', subError.message)
    return res.status(500).json({ error: subError.message })
  }

  const subs = (subRows ?? []) as SubRow[]
  const validSubs = subs.filter((s) => s.endpoint && s.p256dh && s.auth_key)
  console.log(`[cron-push] Loaded ${validSubs.length} valid push subscriptions (with reminder_hours per row)`)

  if (!activeCodes.length || !validSubs.length) {
    return res.status(200).json({
      ok: true,
      checked: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      message: '无未过期兑换码或无订阅',
      activeCodes: activeCodes.length,
      subscriptions: validSubs.length,
    })
  }

  let existingKeys = new Set<string>()
  if (codeIds.length) {
    const { data: sentRows, error: sentError } = await supabase
      .from('sent_notifications')
      .select('endpoint, code_id, kind')
      .eq('kind', 'expiry_reminder')
      .in('code_id', codeIds)

    if (sentError) {
      console.error('[cron-push] sent_notifications 查询失败', sentError.message)
      return res.status(500).json({ error: sentError.message })
    }
    existingKeys = new Set(
      (sentRows ?? []).map((r: { endpoint: string; code_id: number }) => `${r.endpoint}::${r.code_id}`),
    )
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  let checked = 0
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const code of activeCodes) {
    const expiryMs = parseExpiryMs(code.expiry_at)
    if (expiryMs === null || expiryMs <= now) continue

    const remainingMs = expiryMs - now
    const remainingHours = remainingMs / (1000 * 3600)

    for (const sub of validSubs) {
      const R = sub.reminder_hours ?? 24
      const lower = R - MATCH_WINDOW_HOURS
      const upper = R + MATCH_UPPER_SLACK_HOURS
      const inWindow = remainingHours > 0 && remainingHours <= upper && remainingHours > lower
      if (!inWindow) continue

      checked += 1
      const dedupeKey = `${sub.endpoint}::${code.id}`
      if (existingKeys.has(dedupeKey)) {
        skipped += 1
        continue
      }

      const aboutHours = Math.max(1, Math.round(remainingHours))
      // 与 push-all 相同字段结构：title, body, url, icon, badge, badgeCount（未传 icon/badge 时用默认值）
      const payload = buildStandardPushPayload({
        title: '兑换码即将过期',
        body: `快去领取！兑换码 ${code.code_text} 还有约 ${aboutHours} 小时就要过期了！`,
        url: '/',
        badgeCount: 1,
      })

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload,
          { TTL: 3600 },
        )

        const { error: insErr } = await supabase.from('sent_notifications').insert({
          endpoint: sub.endpoint,
          code_id: code.id,
          kind: 'expiry_reminder',
        })

        if (insErr) {
          console.warn('[cron-push] 记录 sent_notifications 失败:', insErr.message)
          failed += 1
          continue
        }

        existingKeys.add(dedupeKey)
        sent += 1
      } catch (e: unknown) {
        failed += 1
        logWebPushError('cron-push', sub.endpoint.slice(0, 80), e)
      }
    }
  }

  return res.status(200).json({
    ok: true,
    checked,
    sent,
    skipped,
    failed,
    matchMode: 'reminder_hours_per_subscription',
    activeCodes: activeCodes.length,
    subscriptions: validSubs.length,
  })
}
