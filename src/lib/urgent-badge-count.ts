import { listCodes } from '@/lib/codes-api'
import type { Code } from '@/types/code'

const PREFS_KEY = 'nikki_preferences_v1'
const SERVER_SETTINGS_KEY = 'user_server_settings'
const CLAIMED_KEY = 'nikkicodes_claimed'

type ServerSettings = {
  shining: string[]
  infinity: string[]
}

const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  shining: ['SN_CN'],
  infinity: ['IN_CN'],
}

function normalizeServerSettings(raw?: Partial<ServerSettings> | null): ServerSettings {
  const shining = Array.isArray(raw?.shining) ? raw.shining.filter(Boolean) : []
  const infinity = Array.isArray(raw?.infinity) ? raw.infinity.filter(Boolean) : []
  return {
    shining: shining.length ? [...new Set(shining)] : [...DEFAULT_SERVER_SETTINGS.shining],
    infinity: infinity.length ? [...new Set(infinity)] : [...DEFAULT_SERVER_SETTINGS.infinity],
  }
}

function getDefaultServerByGame(gameName: string): string {
  return gameName === '闪耀暖暖' ? 'SN_CN' : 'IN_CN'
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
  serverSettings: ServerSettings
  highValueOnly: boolean
  claimedIds: Set<number>
}

export function readUrgentBadgePrefsFromStorage(): Omit<UrgentBadgePrefs, 'claimedIds'> & { claimedIds: Set<number> } {
  let preferredGames = ['无限暖暖', '闪耀暖暖']
  let serverSettings = DEFAULT_SERVER_SETTINGS
  let highValueOnly = false
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as {
        preferredGames?: string[]
        highValueOnly?: boolean
      }
      if (Array.isArray(p.preferredGames)) preferredGames = p.preferredGames
      if (typeof p.highValueOnly === 'boolean') highValueOnly = p.highValueOnly
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(SERVER_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ServerSettings>
      serverSettings = normalizeServerSettings(parsed)
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

  return { preferredGames, serverSettings, highValueOnly, claimedIds }
}

/**
 * 与首页「未领取」视图一致：关注游戏、关注区服、高价值筛选、未过期、未领取。
 */
export function countUrgentUnclaimedFromList(
  codes: Code[],
  opts: UrgentBadgePrefs & { nowMs?: number },
): number {
  const nowMs = opts.nowMs ?? Date.now()
  let n = 0
  for (const item of codes) {
    if (!opts.preferredGames.includes(item.gameName)) continue
    const allowedServers = item.gameName === '闪耀暖暖' ? opts.serverSettings.shining : opts.serverSettings.infinity
    const server = item.server || getDefaultServerByGame(item.gameName)
    if (!allowedServers.includes(server)) continue
    if (opts.highValueOnly && !Boolean(item.diamondReward?.trim())) continue
    const expiryMs = parseExpiryMsForBadge(item.expiryAt)
    if (expiryMs === null || expiryMs <= nowMs) continue
    if (opts.claimedIds.has(item.id)) continue
    n += 1
  }
  return n
}

/** 拉取全量「未领取」视图下的码（各游戏），再按本地偏好与已领取集合计算角标数量 */
export async function fetchUrgentUnclaimedBadgeCount(): Promise<number> {
  const { preferredGames, serverSettings, highValueOnly, claimedIds } = readUrgentBadgePrefsFromStorage()
  const codes = await listCodes('未领取')
  return countUrgentUnclaimedFromList(codes, {
    preferredGames,
    serverSettings,
    highValueOnly,
    claimedIds,
  })
}
