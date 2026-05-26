import type { Code } from '@/types/code'
import { supabase } from '@/lib/supabase'

type CodeRow = {
  id: number
  game_name: string
  server: string | null
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
  /** 图片投稿昵称，空则管理端可显示为「热心玩家」 */
  nickname?: string | null
  isFeatured: boolean
  isRead: boolean
  createdAt: string
}

export type FeaturedImage = {
  id: number
  imageUrl: string
  /** null / 空串时首页展示为「热心玩家」 */
  nickname: string | null
}

function mapRowToCode(row: CodeRow): Code {
  const diamondReward = row.diamond_reward ?? undefined
  const otherReward = row.other_reward ?? undefined

  return {
    id: row.id,
    gameName: row.game_name,
    server: row.server ?? undefined,
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

const ADMIN_PASSWORD_FALLBACK = '123456'
const EXCHANGE_CODE_REGEX = /^[a-zA-Z0-9\u4e00-\u9fa5]+$/
const EXCHANGE_CODE_RULE_HINT = '兑换码仅支持字母、数字及中文'

function requireAdminPassword(password: string) {
  const typed = password.trim()
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  const allow = [expected, ADMIN_PASSWORD_FALLBACK].filter(Boolean)
  if (!typed || !allow.includes(typed)) throw new Error('管理员密码错误')
}

export function verifyAdminPassword(password: string): boolean {
  const typed = password.trim()
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  const allow = [expected, ADMIN_PASSWORD_FALLBACK].filter(Boolean)
  return Boolean(typed && allow.includes(typed))
}

export async function listCodes(game?: string, opts?: { includeInvalid?: boolean }): Promise<Code[]> {
  const includeInvalid = opts?.includeInvalid ?? false
  let query = supabase
    .from('codes')
    .select(
      'id,game_name,server,code_text,reward_desc,diamond_reward,other_reward,expiry_at,reminder_hours,is_high_value,is_invalid,source',
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
  server?: string
  codeText: string
  diamondReward?: string
  otherReward?: string
  expiryAt?: string
  source?: string
  isHighValue?: boolean // 兼容旧逻辑：由 diamondReward 自动推断
}

export async function addCode(input: AddCodeInput): Promise<void> {
  requireAdminPassword(input.password)
  const codeText = input.codeText.trim()
  if (!codeText) throw new Error('兑换码不能为空')
  if (!EXCHANGE_CODE_REGEX.test(codeText)) throw new Error(EXCHANGE_CODE_RULE_HINT)

  const diamond = (input.diamondReward ?? '').trim()
  const other = (input.otherReward ?? '').trim()
  const isHighValue = Boolean(diamond) // 规则：有钻石就是高价值

  const { error } = await supabase.from('codes').insert({
    game_name: input.gameName,
    server: input.server?.trim() || null,
    code_text: codeText,
    // 兼容旧列：如果表里只有 reward_desc，你也能看到“其他奖励”
    reward_desc: other || null,
    diamond_reward: diamond || null,
    other_reward: other || null,
    expiry_at: input.expiryAt || null,
    reminder_hours: null,
    is_high_value: isHighValue,
    is_invalid: false,
    source: input.source || null,
  })

  if (error) throw new Error(error.message)
}

export type ReportType = 'FAKE_CODE' | 'REWARD_MISMATCH'

export type UpdateCodeInput = {
  password: string
  id: number
  codeText: string
  server?: string
  expiryAt?: string | null
  diamondReward?: string
  otherReward?: string
  /** 对应库字段 is_invalid（软删除） */
  isInvalid: boolean
}

export async function updateCode(input: UpdateCodeInput): Promise<void> {
  requireAdminPassword(input.password)

  const ct = input.codeText.trim()
  if (!ct) throw new Error('兑换码不能为空')
  if (!EXCHANGE_CODE_REGEX.test(ct)) throw new Error(EXCHANGE_CODE_RULE_HINT)

  const diamond = (input.diamondReward ?? '').trim()
  const other = (input.otherReward ?? '').trim()
  const isHighValue = Boolean(diamond)

  const patch: Record<string, unknown> = {
    code_text: ct,
    server: input.server?.trim() || null,
    diamond_reward: diamond || null,
    other_reward: other || null,
    reward_desc: other || null,
    is_high_value: isHighValue,
    is_invalid: input.isInvalid,
  }
  if (input.expiryAt !== undefined) {
    patch.expiry_at = input.expiryAt || null
  }

  const { error } = await supabase.from('codes').update(patch).eq('id', input.id)

  if (error) throw new Error(error.message)
}

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  FAKE_CODE: '虚假码',
  REWARD_MISMATCH: '奖励不符',
}

/** 管理页列表：附带 reports 聚合（需管理员密码；RLS 需允许读取 reports） */
export type AdminCodeWithReports = Code & {
  reportCount: number
  reportTypeLabels: string[]
}

export async function fetchAdminCodesWithReports(password: string): Promise<AdminCodeWithReports[]> {
  requireAdminPassword(password)

  const [codes, reportsRes] = await Promise.all([
    listCodes(),
    supabase.from('reports').select('code_id, report_type'),
  ])

  if (reportsRes.error) throw new Error(reportsRes.error.message)

  const byCode = new Map<number, ReportType[]>()
  for (const raw of reportsRes.data ?? []) {
    const row = raw as { code_id: number; report_type: string }
    const cid = Number(row.code_id)
    const rt = row.report_type as ReportType
    if (rt !== 'FAKE_CODE' && rt !== 'REWARD_MISMATCH') continue
    const arr = byCode.get(cid) ?? []
    arr.push(rt)
    byCode.set(cid, arr)
  }

  return codes.map((c) => {
    const list = byCode.get(c.id) ?? []
    const uniqTypes = [...new Set(list)]
    return {
      ...c,
      reportCount: list.length,
      reportTypeLabels: uniqTypes.map((t) => REPORT_TYPE_LABEL[t]),
    }
  })
}

export async function deleteCode(id: number, password: string): Promise<void> {
  requireAdminPassword(password)

  // 用“软删除”方式标记为无效；避免 Supabase RLS 不允许 delete 的复杂策略问题
  const { error } = await supabase.from('codes').update({ is_invalid: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

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

function fileExtensionFromName(originalName: string): string {
  const base = originalName.replace(/^.*[/\\]/, '').trim() || 'image'
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '.jpg'
  return /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '.jpg'
}

const MAX_POSTCARD_NICKNAME_LEN = 48

export async function submitImageFeeding(file: File, options?: { nickname?: string }): Promise<void> {
  const ext = fileExtensionFromName(file.name)

  const signRes = await fetch(pushApiUrl('api/get-cos-sign'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ext }),
  })
  const signPayload = (await signRes.json().catch(() => ({}))) as {
    uploadUrl?: string
    publicUrl?: string
    error?: string
  }
  if (!signRes.ok || !signPayload.uploadUrl || !signPayload.publicUrl) {
    throw new Error(signPayload.error || '获取上传凭证失败')
  }

  const putRes = await fetch(signPayload.uploadUrl, {
    method: 'PUT',
    body: file,
  })
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '')
    console.error('[submitImageFeeding] COS PUT 失败', putRes.status, detail)
    throw new Error('图片上传失败')
  }

  const rawNick = (options?.nickname ?? '').trim().slice(0, MAX_POSTCARD_NICKNAME_LEN)
  const nickname = rawNick.length > 0 ? rawNick : null

  const { error } = await supabase.from('submissions').insert({
    content: '',
    type: 'image',
    image_url: signPayload.publicUrl,
    nickname,
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
  nickname: string | null
  is_featured: boolean | null
  is_read: boolean
  created_at: string
}

export async function listSubmissions(password: string, showRead: boolean): Promise<Submission[]> {
  requireAdminPassword(password)
  let query = supabase
    .from('submissions')
    .select('id,content,type,image_url,nickname,is_featured,is_read,created_at')
    .order('created_at', { ascending: false })
  if (!showRead) query = query.eq('is_read', false)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as SubmissionRow[] | null ?? []).map((row) => ({
    id: row.id,
    content: row.content ?? '',
    type: row.type === 'image' ? 'image' : 'text',
    imageUrl: row.image_url ?? undefined,
    nickname: row.nickname ?? null,
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
    .select('id,image_url,nickname')
    .eq('type', 'image')
    .eq('is_featured', true)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => {
      const r = row as { id: number; image_url: string; nickname: string | null }
      return {
        id: Number(r.id),
        imageUrl: String(r.image_url),
        nickname: r.nickname && String(r.nickname).trim() ? String(r.nickname).trim() : null,
      }
    })
    .filter((x) => Boolean(x.imageUrl))
}
