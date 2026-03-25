import type { Code } from '@/types/code'
import { supabase } from '@/lib/supabase'

type CodeRow = {
  id: number
  game_name: string
  code_text: string
  reward_desc: string | null
  diamond_reward: string | null
  other_reward: string | null
  expiry_at: string | null
  is_high_value: boolean
  is_invalid: boolean
  source: string | null
}

function mapRowToCode(row: CodeRow): Code {
  const diamondReward = row.diamond_reward ?? undefined
  const otherReward = row.other_reward ?? undefined

  return {
    id: row.id,
    gameName: row.game_name,
    codeText: row.code_text,
    diamondReward: diamondReward && diamondReward.trim() ? diamondReward : undefined,
    otherReward: otherReward && otherReward.trim() ? otherReward : undefined,
    // 兼容：如果数据库还只有旧字段 reward_desc，则尝试把它当作“其他奖励”
    rewardDesc:
      (row.reward_desc ?? undefined) && (!otherReward || !otherReward.trim()) ? row.reward_desc ?? undefined : undefined,
    expiryAt: row.expiry_at ?? undefined,
    isHighValue: row.is_high_value,
    isInvalid: row.is_invalid,
    source: row.source ?? undefined,
  }
}

export async function listCodes(game?: string, opts?: { includeInvalid?: boolean }): Promise<Code[]> {
  const includeInvalid = opts?.includeInvalid ?? false
  let query = supabase
    .from('codes')
    .select('id,game_name,code_text,reward_desc,diamond_reward,other_reward,expiry_at,is_high_value,is_invalid,source')
    .order('is_high_value', { ascending: false })
    .order('expiry_at', { ascending: true, nullsFirst: false })

  if (game && game !== '全部') query = query.eq('game_name', game)
  if (!includeInvalid) query = query.eq('is_invalid', false)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapRowToCode(row as CodeRow))
}

export type AddCodeInput = {
  password: string
  gameName: string
  codeText: string
  diamondReward?: string
  otherReward?: string
  expiryAt?: string
  source?: string
  isHighValue?: boolean // 兼容旧逻辑：由 diamondReward 自动推断
}

export async function addCode(input: AddCodeInput): Promise<void> {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  if (!expected || input.password !== expected) throw new Error('管理员密码错误')

  const diamond = (input.diamondReward ?? '').trim()
  const other = (input.otherReward ?? '').trim()
  const isHighValue = Boolean(diamond) // 规则：有钻石就是高价值

  const { error } = await supabase.from('codes').insert({
    game_name: input.gameName,
    code_text: input.codeText.toUpperCase(),
    // 兼容旧列：如果表里只有 reward_desc，你也能看到“其他奖励”
    reward_desc: other || null,
    diamond_reward: diamond || null,
    other_reward: other || null,
    expiry_at: input.expiryAt || null,
    is_high_value: isHighValue,
    is_invalid: false,
    source: input.source || null,
  })

  if (error) throw new Error(error.message)
}

export async function deleteCode(id: number, password: string): Promise<void> {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  if (!expected || password !== expected) throw new Error('管理员密码错误')

  // 用“软删除”方式标记为无效；避免 Supabase RLS 不允许 delete 的复杂策略问题
  const { error } = await supabase.from('codes').update({ is_invalid: true }).eq('id', id)
  if (error) throw new Error(error.message)
}
