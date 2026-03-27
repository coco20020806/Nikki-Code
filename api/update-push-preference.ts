import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_REMINDER_HOURS = new Set([1, 6, 12, 24])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      endpoint?: string
      reminder_hours?: number
    }

    const endpoint = (body.endpoint ?? '').trim()
    const reminderHours = Number(body.reminder_hours)

    if (!endpoint) return res.status(400).json({ error: '缺少 endpoint' })
    if (!ALLOWED_REMINDER_HOURS.has(reminderHours)) {
      return res.status(400).json({ error: 'reminder_hours 必须为 1、6、12 或 24' })
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: '服务器未配置 Supabase Service Role' })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase
      .from('push_subscriptions')
      .update({
        reminder_hours: reminderHours,
        updated_at: new Date().toISOString(),
      })
      .eq('endpoint', endpoint)
      .select('endpoint')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: '未找到该推送订阅，请先在首页开启推送' })

    return res.status(200).json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '更新失败'
    console.error('[update-push-preference]', e)
    return res.status(500).json({ error: message })
  }
}
