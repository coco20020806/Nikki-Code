import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/** 与前端设置一致；sent_notifications.kind 使用 expiry_reminder_${R} 区分档位防重复 */
const ALLOWED_REMINDER_HOURS = [1, 6, 12, 24] as const
const LEGACY_REMINDER_KIND = 'expiry_reminder'

function reminderKindForHours(R: number): string {
  return `expiry_reminder_${R}`
}

/** 将订阅的 reminder_hours 规范到允许值；异常值回退 24 */
function normalizeReminderHours(raw: number | null | undefined): number {
  const v = raw ?? 24
  return (ALLOWED_REMINDER_HOURS as readonly number[]).includes(v) ? v : 24
}

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

function subscriptionLogLabel(endpoint: string): string {
  return endpoint.length > 72 ? `${endpoint.slice(0, 72)}…` : endpoint
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
    '[cron-push] 阈值规则：对每条订阅取 push_subscriptions.reminder_hours（1/6/12/24，默认 24）；' +
      '当码的 hours_left > 0 且 hours_left <= reminder_hours 时符合提醒条件。',
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

  const activeCodes = (codeRows ?? []).filter((c) => {
    const ms = parseExpiryMs((c as CodeRow).expiry_at)
    return ms !== null && ms > now
  }) as CodeRow[]

  const codeIds = activeCodes.map((c) => c.id)
  console.log(`[cron-push] Found ${activeCodes.length} active codes (expiry > now)`)

  const { data: subRows, error: subError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key, reminder_hours')

  if (subError) {
    console.error('[cron-push] push_subscriptions 查询失败', subError.message)
    return res.status(500).json({ error: subError.message })
  }

  const subs = (subRows ?? []) as SubRow[]
  const validSubs = subs.filter((s) => s.endpoint && s.p256dh && s.auth_key)
  console.log(`[cron-push] Loaded ${validSubs.length} valid push subscriptions`)

  if (!activeCodes.length || !validSubs.length) {
    return res.status(200).json({
      ok: true,
      checked: 0,
      sent: 0,
      skipped: 0,
      skippedNotYetDue: 0,
      failed: 0,
      message: '无未过期兑换码或无订阅',
      activeCodes: activeCodes.length,
      subscriptions: validSubs.length,
    })
  }

  const tierKinds = [...ALLOWED_REMINDER_HOURS.map(reminderKindForHours), LEGACY_REMINDER_KIND]

  let existingKeys = new Set<string>()
  if (codeIds.length) {
    const { data: sentRows, error: sentError } = await supabase
      .from('sent_notifications')
      .select('endpoint, code_id, kind')
      .in('code_id', codeIds)
      .in('kind', tierKinds)

    if (sentError) {
      console.error('[cron-push] sent_notifications 查询失败', sentError.message)
      return res.status(500).json({ error: sentError.message })
    }
    for (const r of sentRows ?? []) {
      const row = r as { endpoint: string; code_id: number; kind: string }
      existingKeys.add(`${row.endpoint}::${row.code_id}::${row.kind}`)
    }
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  let checked = 0
  let sent = 0
  let skipped = 0
  let skippedNotYetDue = 0
  let failed = 0

  for (const code of activeCodes) {
    const expiryMs = parseExpiryMs(code.expiry_at)
    if (expiryMs === null || expiryMs <= now) continue

    const remainingMs = expiryMs - now
    const hoursLeft = remainingMs / (1000 * 3600)
    console.log(
      `[cron-push] code id=${code.id} text=${code.code_text} hours_left=${hoursLeft.toFixed(3)} (threshold uses reminder_hours per subscription)`,
    )

    for (const sub of validSubs) {
      const R = normalizeReminderHours(sub.reminder_hours)
      const kind = reminderKindForHours(R)

      if (hoursLeft <= 0) continue

      if (hoursLeft > R) {
        skippedNotYetDue += 1
        continue
      }

      checked += 1

      const dedupeKey = `${sub.endpoint}::${code.id}::${kind}`
      const legacyKey = `${sub.endpoint}::${code.id}::${LEGACY_REMINDER_KIND}`

      if (existingKeys.has(dedupeKey) || existingKeys.has(legacyKey)) {
        skipped += 1
        console.log(
          `[cron-push] Reminder for ${R}h already sent (code_id=${code.id}, subscription=${subscriptionLogLabel(sub.endpoint)}, kind=${existingKeys.has(legacyKey) ? LEGACY_REMINDER_KIND : kind}) — skipping`,
        )
        continue
      }

      const aboutHours = Math.max(1, Math.round(hoursLeft))
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
          kind,
        })

        if (insErr) {
          console.warn('[cron-push] 记录 sent_notifications 失败:', insErr.message)
          failed += 1
          continue
        }

        existingKeys.add(dedupeKey)
        sent += 1
        console.log(
          `[cron-push] Sent ${R}h reminder for code_id=${code.id} to subscription=${subscriptionLogLabel(sub.endpoint)}`,
        )
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
    skippedNotYetDue,
    failed,
    matchMode: 'threshold_hours_left_lte_reminder_hours',
    activeCodes: activeCodes.length,
    subscriptions: validSubs.length,
  })
}
