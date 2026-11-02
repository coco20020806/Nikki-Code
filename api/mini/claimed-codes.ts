import type { VercelRequest, VercelResponse } from '@vercel/node'
import { miniSupabase, numericCodeId, requireMiniUser } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const userId = await requireMiniUser(req, res)
    if (!userId) return
    const supabase = miniSupabase()

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('mini_claimed_codes')
        .select('code_id')
        .eq('user_id', userId)
      if (error) throw error
      return res.status(200).json({ claimedCodeIds: (data || []).map((row) => Number(row.code_id)) })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const codeId = numericCodeId(body?.codeId)
    if (!codeId) return res.status(400).json({ error: '兑换码 ID 无效' })

    if (req.method === 'POST') {
      const { error } = await supabase
        .from('mini_claimed_codes')
        .upsert({ user_id: userId, code_id: codeId }, { onConflict: 'user_id,code_id' })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('mini_claimed_codes')
        .delete()
        .eq('user_id', userId)
        .eq('code_id', codeId)
      if (error) throw error
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('[mini/claimed-codes]', error)
    return res.status(500).json({ error: '兑换记录同步失败' })
  }
}

