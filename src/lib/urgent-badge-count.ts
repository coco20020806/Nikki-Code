import { listCodes } from '@/lib/codes-api'
import type { Code } from '@/types/code'

const PREFS_KEY = 'nikki_preferences_v1'
const CLAIMED_KEY = 'nikkicodes_claimed'

/** 与 Cron 每日巡逻一致：24 / 72 / 168 小时 */
const PATROL_TIER_HOURS = [24, 72, 168] as const

function normalizeUserPushCap(h: number): number {
  if (h === 24 || h === 72 || h === 168) return h
  if (h === 1 || h === 6 || h === 12) return 24
  return 168
}

function codeReminderCap(raw: number | null | undefined): number {
  if (raw == null) return 168
  if ((PATROL_TIER_HOURS as readonly number[]).includes(raw)) return raw
  return 168
}

/** 是否在「会触发任一档巡逻提醒」的窗口内（用户 cap ∩ 码 cap） */
function isInPatrolWindow(hoursLeft: number, userCap: number, codeCap: number): boolean {
  const cap = Math.min(userCap, codeCap)
  for (const T of PATROL_TIER_HOURS) {
    if (T > cap) continue
    if (hoursLeft > 0 && hoursLeft <= T) return true
  }
  return false
}

export function parseExpiryMsForBadge(expiryAt?: string): number | null {
  if (!expiryAt) return null
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(expiryAt)
  const normalized = hasTz ? expiryAt : `${expiryAt}+08:00`
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? null : ms
}

export type UrgentBadgePrefs = {
  preferredGames: string[]
  pushReminderHours: number
  highValueOnly: boolean
  claimedIds: Set<number>
}

export function readUrgentBadgePrefsFromStorage(): Omit<UrgentBadgePrefs, 'claimedIds'> & { claimedIds: Set<number> } {
  let preferredGames = ['无限暖暖', '闪耀暖暖']
  let pushReminderHours = 168
  let highValueOnly = false
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as {
        preferredGames?: string[]
        pushReminderHours?: number
        highValueOnly?: boolean
      }
      if (Array.isArray(p.preferredGames)) preferredGames = p.preferredGames
      if (typeof p.pushReminderHours === 'number') {
        pushReminderHours = normalizeUserPushCap(p.pushReminderHours)
      }
      if (typeof p.highValueOnly === 'boolean') highValueOnly = p.highValueOnly
    }
  } catch {
    /* ignore */
  }

  let claimedIds = new Set<number>()
  try {
    const raw = localStorage.getItem(CLAIMED_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) claimedIds = new Set(arr.map((x) => Number(x)))
    }
  } catch {
    /* ignore */
  }

  return { preferredGames, pushReminderHours, highValueOnly, claimedIds }
}

/**
 * 与 Cron 每日巡逻一致：关注游戏、高价值、未过期、未领取，
 * 且剩余时间落在用户「到期提醒」偏好与码表提醒上限的交集巡逻窗口内。
 */
export function countUrgentUnclaimedFromList(
  codes: Code[],
  opts: UrgentBadgePrefs & { nowMs?: number },
): number {
  const nowMs = opts.nowMs ?? Date.now()
  let n = 0
  for (const item of codes) {
    if (!opts.preferredGames.includes(item.gameName)) continue
    if (opts.highValueOnly && !Boolean(item.diamondReward?.trim())) continue
    const expiryMs = parseExpiryMsForBadge(item.expiryAt)
    if (expiryMs === null || expiryMs <= nowMs) continue
    if (opts.claimedIds.has(item.id)) continue
    const hoursLeft = (expiryMs - nowMs) / (1000 * 3600)
    const codeCap = codeReminderCap(item.reminderHours ?? null)
    if (isInPatrolWindow(hoursLeft, opts.pushReminderHours, codeCap)) n += 1
  }
  return n
}

/** 拉取全量「未领取」视图下的码（各游戏），再按本地偏好与已领取集合计算角标数量 */
export async function fetchUrgentUnclaimedBadgeCount(): Promise<number> {
  const { preferredGames, pushReminderHours, highValueOnly, claimedIds } = readUrgentBadgePrefsFromStorage()
  const codes = await listCodes('未领取')
  return countUrgentUnclaimedFromList(codes, {
    preferredGames,
    pushReminderHours,
    highValueOnly,
    claimedIds,
  })
}
