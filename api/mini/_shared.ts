import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function miniSupabase(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('小程序服务端数据库配置缺失')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}

export function bearerToken(req: VercelRequest): string {
  const auth = String(req.headers.authorization || '')
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()

  const miniSession = req.headers['x-mini-session']
  return String(Array.isArray(miniSession) ? miniSession[0] : miniSession || '').trim()
}

export async function requireMiniUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const token = bearerToken(req)
  if (!token) {
    res.status(401).json({ error: '请重新登录' })
    return null
  }

  const supabase = miniSupabase()
  const { data, error } = await supabase
    .from('mini_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (error || !data || Date.parse(String(data.expires_at)) <= Date.now()) {
    res.status(401).json({ error: '登录已过期，请重新进入小程序' })
    return null
  }
  return String(data.user_id)
}

export function numericCodeId(value: unknown): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

