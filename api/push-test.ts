import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

type PushRow = {
  endpoint: string
  p256dh: string
  auth_key: string
}

function warnIfServerVapidMissing(): void {
  const pub = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) {
    console.warn(
      '[NikkiCode push-test] 服务器缺少 VAPID 密钥：请配置 VAPID_PRIVATE_KEY，以及 VAPID_PUBLIC_KEY（或与前端一致的 VITE_VAPID_PUBLIC_KEY）。另需设置 VAPID_SUBJECT（如 mailto:xxx）。',
    )
  }
}

function warnIfSupabaseServiceRoleMissing(): void {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!key) {
    console.warn(
      '[NikkiCode push-test] 全服推送需要 SUPABASE_SERVICE_ROLE_KEY（仅服务端），用于读取 push_subscriptions 全表；请勿将该密钥写入前端或提交到仓库。',
    )
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    warnIfServerVapidMissing()
    warnIfSupabaseServiceRoleMissing()

    const expectedPassword = process.env.VITE_ADMIN_PASSWORD
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { password?: string }

    if (!expectedPassword || body.password !== expectedPassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: '服务器未配置 SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY，无法读取订阅列表',
      })
    }

    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
    const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim()
    const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@localhost').trim()

    if (!publicKey || !privateKey) {
      return res.status(500).json({ error: '服务器未配置 VAPID 公钥/私钥，无法发送推送' })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: rows, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')

    if (dbError) {
      console.error('[NikkiCode push-test] Supabase:', dbError.message)
      return res.status(500).json({ error: `读取订阅失败：${dbError.message}` })
    }

    const list = (rows ?? []) as PushRow[]
    const valid = list.filter((r) => r.endpoint && r.p256dh && r.auth_key)

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const payload = JSON.stringify({
      title: '全服推送测试',
      body: '如果你看到这条，说明 PWA 推送通了！',
      url: '/',
    })

    let sent = 0
    let failed = 0
    for (const row of valid) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth_key },
          },
          payload,
          { TTL: 120 },
        )
        sent += 1
      } catch (e: unknown) {
        failed += 1
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[NikkiCode push-test] 单条发送失败:', row.endpoint.slice(0, 80), msg)
      }
    }

    return res.status(200).json({
      ok: true,
      total: valid.length,
      sent,
      failed,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '发送失败'
    console.error('[NikkiCode push-test]', e)
    return res.status(500).json({ error: message })
  }
}
