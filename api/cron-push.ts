import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/** 与定时任务间隔匹配：在此时间窗内视为「命中」该提醒档位（略宽于 R，减少漏发） */
const MATCH_WINDOW_HOURS = 1.5
const MATCH_UPPER_SLACK_HOURS = 0.5

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = (process.env.CRON_SECRET || '').trim()
  const auth = (req.headers.authorization || '').trim()
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

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

  const { data: codeRows, error: codesError } = await supabase
    .from('codes')
    .select('id, code_text, expiry_at')
    .eq('is_invalid', false)
    .not('expiry_at', 'is', null)

  if (codesError) {
    console.error('[cron-push] codes', codesError.message)
    return res.status(500).json({ error: codesError.message })
  }

  const codes = (codeRows ?? []).filter((c) => {
    const ms = parseExpiryMs((c as CodeRow).expiry_at)
    return ms !== null && ms > now
  }) as CodeRow[]
  const codeIds = codes.map((c) => c.id)

  const { data: subRows, error: subError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key, reminder_hours')

  if (subError) {
    console.error('[cron-push] push_subscriptions', subError.message)
    return res.status(500).json({ error: subError.message })
  }

  const subs = (subRows ?? []) as SubRow[]
  if (!codes.length || !subs.length) {
    return res.status(200).json({ ok: true, checked: 0, sent: 0, skipped: 0, failed: 0, message: '无待处理码或无订阅' })
  }

  let existingKeys = new Set<string>()
  if (codeIds.length) {
    const { data: sentRows, error: sentError } = await supabase
      .from('sent_notifications')
      .select('endpoint, code_id, kind')
      .eq('kind', 'expiry_reminder')
      .in('code_id', codeIds)

    if (sentError) {
      console.error('[cron-push] sent_notifications', sentError.message)
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

  for (const code of codes) {
    const expiryMs = parseExpiryMs(code.expiry_at)
    if (expiryMs === null || expiryMs <= now) continue

    const remainingMs = expiryMs - now
    const remainingHours = remainingMs / (1000 * 3600)

    for (const sub of subs) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth_key) continue

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
      const payload = JSON.stringify({
        title: '兑换码即将过期',
        body: `快去领取！兑换码 ${code.code_text} 还有约 ${aboutHours} 小时就要过期了！`,
        url: '/',
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
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[cron-push] 发送失败', sub.endpoint.slice(0, 60), msg)
      }
    }
  }

  return res.status(200).json({ ok: true, checked, sent, skipped, failed })
}
