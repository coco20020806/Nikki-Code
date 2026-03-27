import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'

type SubscriptionBody = {
  endpoint: string
  expirationTime?: number | null
  keys?: { p256dh: string; auth: string }
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    warnIfServerVapidMissing()

    const expectedPassword = process.env.VITE_ADMIN_PASSWORD
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string
      subscription?: SubscriptionBody
    }

    if (!expectedPassword || body.password !== expectedPassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
    const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim()
    const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@localhost').trim()

    if (!publicKey || !privateKey) {
      return res.status(500).json({ error: '服务器未配置 VAPID 公钥/私钥，无法发送推送' })
    }

    const sub = body.subscription
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return res.status(400).json({ error: '缺少有效的 subscription（请先在本机首页开启推送）' })
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const payload = JSON.stringify({
      title: 'NikkiCode 测试推送',
      body: '这是一条来自管理后台的测试通知',
      url: '/',
    })

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      payload,
      { TTL: 60 },
    )

    return res.status(200).json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '发送失败'
    console.error('[NikkiCode push-test]', e)
    return res.status(500).json({ error: message })
  }
}
