import type { VercelRequest, VercelResponse } from '@vercel/node'
import { miniSupabase } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' })

  try {
    const { data, error } = await miniSupabase()
      .from('codes')
      .select('id,game_name,server,code_text,reward_desc,diamond_reward,other_reward,expiry_at,is_high_value,source')
      .eq('is_invalid', false)
      .order('is_high_value', { ascending: false })
      .order('expiry_at', { ascending: true, nullsFirst: false })
    if (error) throw error

    const codes = (data || []).map((row) => ({
      id: Number(row.id),
      gameName: String(row.game_name),
      server: row.server || undefined,
      codeText: String(row.code_text),
      rewardDesc: row.reward_desc || undefined,
      diamondReward: row.diamond_reward || undefined,
      otherReward: row.other_reward || undefined,
      expiryAt: row.expiry_at || undefined,
      isHighValue: Boolean(row.is_high_value),
      source: row.source || undefined,
    }))
    return res.status(200).json({ codes })
  } catch (error) {
    console.error('[mini/codes]', error)
    return res.status(500).json({ error: '兑换码加载失败' })
  }
}

