import { listCodes } from '@/lib/codes-api'
import type { Code } from '@/types/code'

const PREFS_KEY = 'nikki_preferences_v1'
const CLAIMED_KEY = 'nikkicodes_claimed'
const PUSH_REMINDER_OPTIONS = [1, 6, 12, 24] as const

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
  let pushReminderHours = 24
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
      if (typeof p.pushReminderHours === 'number' && (PUSH_REMINDER_OPTIONS as readonly number[]).includes(p.pushReminderHours)) {
        pushReminderHours = p.pushReminderHours
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
 * 与首页「未领取」列表过滤一致：关注游戏、高价值、未过期、未标记已领取，
 * 且剩余时间在 (0, pushReminderHours] 内（与 Cron 阈值一致）。
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
    if (hoursLeft > 0 && hoursLeft <= opts.pushReminderHours) n += 1
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
