import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

type PushRow = {
  endpoint: string
  p256dh: string
  auth_key: string
}

function verifyAdminPassword(password: string): boolean {
  const expected = (process.env.VITE_ADMIN_PASSWORD || '').trim()
  const fallback = '123456'
  const typed = password.trim()
  if (!typed) return false
  return typed === expected || typed === fallback
}

function serverLabel(server: string): string {
  const map: Record<string, string> = {
    SN_CN: '闪耀暖暖国服',
    SN_TW: '闪耀暖暖台服',
    SN_JP: '闪耀暖暖日服',
    SN_GL: '闪耀暖暖国际服',
    IN_CN: '无限暖暖国服',
    IN_GL: '无限暖暖国际服',
  }
  return map[server] || server
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string
      gameName?: string
      server?: string
    }
    const password = String(body.password ?? '').trim()
    const gameName = String(body.gameName ?? '').trim()
    const server = String(body.server ?? '').trim()

    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!gameName || !server) {
      return res.status(400).json({ error: '缺少 gameName 或 server' })
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

    const list = (rows ?? []) as PushRow[]
    const valid = list.filter((r) => r.endpoint && r.p256dh && r.auth_key)

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const payload = JSON.stringify({
      title: '新兑换码上线啦！',
      body: `你关注的 ${serverLabel(server)} 有新的福利，快来领取吧~`,
      gameName,
      server,
      url: '/',
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      badgeCount: 1,
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
          { TTL: 3600 },
        )
        sent += 1
      } catch {
        failed += 1
      }
    }

    return res.status(200).json({ ok: true, total: valid.length, sent, failed })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '发送失败'
    return res.status(500).json({ error: message })
  }
}
