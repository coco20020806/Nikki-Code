import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  miniSupabase,
  newSessionToken,
  sessionExpiresAt,
  sha256,
} from './_shared.js'

type WechatSessionResponse = {
  openid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const code = String(body?.code || '').trim()
    if (!code) return res.status(400).json({ error: '缺少微信登录凭证' })

    const appId = (process.env.WECHAT_MINI_APP_ID || '').trim()
    const appSecret = (process.env.WECHAT_MINI_APP_SECRET || '').trim()
    if (!appId || !appSecret) return res.status(503).json({ error: '微信登录服务尚未配置' })

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', appSecret)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    const wxResponse = await fetch(url)
    const wxSession = (await wxResponse.json()) as WechatSessionResponse
    if (!wxResponse.ok || !wxSession.openid) {
      console.error('[mini/login] code2Session failed', wxSession.errcode, wxSession.errmsg)
      return res.status(401).json({ error: '微信登录失败，请稍后重试' })
    }

    const supabase = miniSupabase()
    const openidHash = sha256(wxSession.openid)
    const { data: user, error: userError } = await supabase
      .from('mini_users')
      .upsert({ openid_hash: openidHash, last_login_at: new Date().toISOString() }, { onConflict: 'openid_hash' })
      .select('id')
      .single()
    if (userError || !user) throw userError || new Error('用户创建失败')

    const token = newSessionToken()
    const expiresAt = sessionExpiresAt()
    const { error: sessionError } = await supabase.from('mini_sessions').insert({
      token_hash: sha256(token),
      user_id: user.id,
      expires_at: expiresAt,
    })
    if (sessionError) throw sessionError

    return res.status(200).json({ token, expiresAt })
  } catch (error) {
    console.error('[mini/login]', error)
    return res.status(500).json({ error: '登录服务暂时不可用' })
  }
}

