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
  reminder_hours: number | null
  is_high_value: boolean
  is_invalid: boolean
  source: string | null
}

export type Submission = {
  id: number
  content: string
  type: 'text' | 'image'
  imageUrl?: string
  isFeatured: boolean
  isRead: boolean
  createdAt: string
}

export type FeaturedImage = {
  id: number
  imageUrl: string
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
    reminderHours: row.reminder_hours ?? undefined,
    isHighValue: row.is_high_value,
    isInvalid: row.is_invalid,
    source: row.source ?? undefined,
  }
}

function requireAdminPassword(password: string) {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  if (!expected || password !== expected) throw new Error('管理员密码错误')
}

export function verifyAdminPassword(password: string): boolean {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  return Boolean(expected && password.trim() && password === expected)
}

export async function listCodes(game?: string, opts?: { includeInvalid?: boolean }): Promise<Code[]> {
  const includeInvalid = opts?.includeInvalid ?? false
  let query = supabase
    .from('codes')
    .select(
      'id,game_name,code_text,reward_desc,diamond_reward,other_reward,expiry_at,reminder_hours,is_high_value,is_invalid,source',
    )
    .order('is_high_value', { ascending: false })
    .order('expiry_at', { ascending: true, nullsFirst: false })

  if (game && game !== '未领取') query = query.eq('game_name', game)
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
  /** 24 / 72 / 168，与巡逻档位一致；未传则 null（等价 7 天起） */
  reminderHours?: number | null
}

export async function addCode(input: AddCodeInput): Promise<void> {
  requireAdminPassword(input.password)

  const diamond = (input.diamondReward ?? '').trim()
  const other = (input.otherReward ?? '').trim()
  const isHighValue = Boolean(diamond) // 规则：有钻石就是高价值

  const rh =
    input.reminderHours != null && [24, 72, 168].includes(input.reminderHours) ? input.reminderHours : null

  const { error } = await supabase.from('codes').insert({
    game_name: input.gameName,
    code_text: input.codeText.toUpperCase(),
    // 兼容旧列：如果表里只有 reward_desc，你也能看到“其他奖励”
    reward_desc: other || null,
    diamond_reward: diamond || null,
    other_reward: other || null,
    expiry_at: input.expiryAt || null,
    reminder_hours: rh,
    is_high_value: isHighValue,
    is_invalid: false,
    source: input.source || null,
  })

  if (error) throw new Error(error.message)
}

const UPDATE_CODE_GAMES = ['无限暖暖', '闪耀暖暖'] as const

export type UpdateCodeInput = {
  password: string
  id: number
  codeText: string
  gameName: string
  expiryAt?: string | null
  reminderHours?: number | null
}

export async function updateCode(input: UpdateCodeInput): Promise<void> {
  requireAdminPassword(input.password)

  const ct = input.codeText.trim()
  if (!ct) throw new Error('兑换码不能为空')

  const gameName = input.gameName.trim()
  if (!gameName) throw new Error('游戏名称不能为空')
  if (!(UPDATE_CODE_GAMES as readonly string[]).includes(gameName)) {
    throw new Error('游戏名称无效')
  }

  const patch: {
    code_text: string
    game_name: string
    expiry_at?: string | null
    reminder_hours?: number | null
  } = {
    code_text: ct.toUpperCase(),
    game_name: gameName,
  }
  if (input.expiryAt !== undefined) {
    patch.expiry_at = input.expiryAt || null
  }
  if (input.reminderHours !== undefined) {
    patch.reminder_hours =
      input.reminderHours === null
        ? null
        : [24, 72, 168].includes(input.reminderHours)
          ? input.reminderHours
          : null
  }

  const { error } = await supabase.from('codes').update(patch).eq('id', input.id)

  if (error) throw new Error(error.message)
}

export async function deleteCode(id: number, password: string): Promise<void> {
  requireAdminPassword(password)

  // 用“软删除”方式标记为无效；避免 Supabase RLS 不允许 delete 的复杂策略问题
  const { error } = await supabase.from('codes').update({ is_invalid: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

export type ReportType = 'FAKE_CODE' | 'REWARD_MISMATCH'

export async function reportIssue(codeId: number, reportType: ReportType): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    code_id: codeId,
    report_type: reportType,
  })
  if (error) throw new Error(error.message)
}

export async function submitFeedback(content: string): Promise<void> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('内容不能为空')
  const { error } = await supabase.from('submissions').insert({
    content: trimmed,
    type: 'text',
    is_read: false,
    is_featured: false,
  })
  if (error) throw new Error(error.message)
}

/** 去掉路径，仅保留一段文件名；替换路径/URL 非法与控制字符，避免重名用外层 Date.now() 前缀 */
function safeStorageFileName(originalName: string): string {
  const base = originalName.replace(/^.*[/\\]/, '').trim() || 'image'
  const cleaned = base.replace(/[\x00-\x1f"#*:<>?|]/g, '_').replace(/^\.+/, '')
  return cleaned || 'image.jpg'
}

export async function submitImageFeeding(file: File): Promise<void> {
  const safeName = safeStorageFileName(file.name)
  const filePath = `feedings/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from('submissions').upload(filePath, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (uploadError) {
    console.error('[submitImageFeeding] Storage 上传失败，完整 error:', uploadError)
    console.error('[submitImageFeeding] error 序列化:', JSON.stringify(uploadError, null, 2))
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from('submissions').getPublicUrl(filePath)
  const { error } = await supabase.from('submissions').insert({
    content: '',
    type: 'image',
    image_url: data.publicUrl,
    is_read: false,
    is_featured: false,
  })
  if (error) {
    console.error('[submitImageFeeding] submissions 表插入失败，完整 error:', error)
    console.error('[submitImageFeeding] error 序列化:', JSON.stringify(error, null, 2))
    throw new Error(error.message)
  }
}

type SubmissionRow = {
  id: number
  content: string | null
  type: 'text' | 'image' | null
  image_url: string | null
  is_featured: boolean | null
  is_read: boolean
  created_at: string
}

export async function listSubmissions(password: string, showRead: boolean): Promise<Submission[]> {
  requireAdminPassword(password)
  let query = supabase
    .from('submissions')
    .select('id,content,type,image_url,is_featured,is_read,created_at')
    .order('created_at', { ascending: false })
  if (!showRead) query = query.eq('is_read', false)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as SubmissionRow[] | null ?? []).map((row) => ({
    id: row.id,
    content: row.content ?? '',
    type: row.type === 'image' ? 'image' : 'text',
    imageUrl: row.image_url ?? undefined,
    isFeatured: Boolean(row.is_featured),
    isRead: row.is_read,
    createdAt: row.created_at,
  }))
}

export async function setSubmissionRead(password: string, id: number, isRead: boolean): Promise<void> {
  requireAdminPassword(password)
  const { error } = await supabase.from('submissions').update({ is_read: isRead }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setSubmissionFeatured(password: string, id: number, isFeatured: boolean): Promise<void> {
  requireAdminPassword(password)
  const { error } = await supabase.from('submissions').update({ is_featured: isFeatured }).eq('id', id)
  if (error) throw new Error(error.message)
}

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime?: number | null
  keys?: { p256dh: string; auth: string }
}

function pushApiUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL || '/'}`).toString()
}

const ALLOWED_PUSH_REMINDER_HOURS = new Set([24, 72, 168])

/** 将当前设备的 reminder_hours 同步到 Supabase（需已存在 push_subscriptions 记录） */
export async function updatePushPreference(endpoint: string, reminderHours: number): Promise<void> {
  const ep = endpoint.trim()
  if (!ep) throw new Error('缺少推送 endpoint')
  if (!ALLOWED_PUSH_REMINDER_HOURS.has(reminderHours)) throw new Error('reminder_hours 无效')

  const res = await fetch(pushApiUrl('api/update-push-preference'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: ep, reminder_hours: reminderHours }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || `更新失败（${res.status}）`)
}

/** 将浏览器 Push 订阅写入 / 更新到 Supabase push_subscriptions（需先在数据库建表并配置 RLS，见仓库内 supabase/push_subscriptions.sql） */
export async function upsertPushSubscription(
  sub: PushSubscriptionJSON,
  options?: { reminderHours?: number },
): Promise<void> {
  const endpoint = sub.endpoint?.trim()
  const p256dh = sub.keys?.p256dh
  const auth = sub.keys?.auth
  if (!endpoint || !p256dh || !auth) throw new Error('推送订阅数据不完整')

  const reminderHours = options?.reminderHours ?? 168
  if (!ALLOWED_PUSH_REMINDER_HOURS.has(reminderHours)) throw new Error('reminder_hours 无效')

  const row = {
    endpoint,
    p256dh,
    auth_key: auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 512) : null,
    reminder_hours: reminderHours,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function listFeaturedImages(limit = 30): Promise<FeaturedImage[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('id,image_url')
    .eq('type', 'image')
    .eq('is_featured', true)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => ({ id: Number((row as { id: number }).id), imageUrl: String((row as { image_url: string }).image_url) }))
    .filter((x) => Boolean(x.imageUrl))
}
