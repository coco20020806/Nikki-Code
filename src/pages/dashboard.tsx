import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  Settings,
  X,
} from 'lucide-react'
import { CodeCard } from '@/components/code-card'
import { Layout } from '@/components/layout'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import { useClaimedCodes } from '@/hooks/use-claimed-codes'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  listCodes,
  listFeaturedImages,
  submitFeedback,
  submitImageFeeding,
  updatePushPreference,
  type FeaturedImage,
} from '@/lib/codes-api'
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh'
import {
  activateWaitingServiceWorkerAndReload,
  checkServiceWorkerUpdateAvailable,
} from '@/lib/sw-update'
import { APP_VERSION } from '@/lib/app-version'
import { isVapidPublicKeyConfigured, subscribePushAndPersist, warnIfVapidKeysMissingInClient } from '@/lib/push-notifications'
import type { Code } from '@/types/code'

const GAME_FILTERS = ['未领取', '无限暖暖', '闪耀暖暖']
const STORAGE_KEY = 'nikki_preferences_v1'
const SERVER_SETTINGS_KEY = 'user_server_settings'

type ServerSettings = {
  shining: string[]
  infinity: string[]
}

const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  shining: ['SN_CN'],
  infinity: ['IN_CN'],
}

const SHINING_SERVER_OPTIONS = [
  { code: 'SN_CN', label: '国服' },
  { code: 'SN_TW', label: '台服' },
  { code: 'SN_JP', label: '日服' },
  { code: 'SN_GL', label: 'Global' },
] as const

const INFINITY_SERVER_OPTIONS = [
  { code: 'IN_CN', label: '国服' },
  { code: 'IN_GL', label: 'Global' },
] as const

const SERVER_LABEL_MAP: Record<string, string> = {
  SN_CN: '国服',
  SN_TW: '台服',
  SN_JP: '日服',
  SN_GL: 'Global',
  IN_CN: '国服',
  IN_GL: 'Global',
}
const XHS_GROUP_URL = 'https://xhslink.com/m/4CZ4iefddWD'
const XHS_DEV_URL = 'https://xhslink.com/m/1F4K5OqbaLQ'

function postcardDisplayName(nickname: string | null | undefined): string {
  const t = (nickname ?? '').trim()
  return t.length > 0 ? t : '热心玩家'
}

/** 与每日巡逻 Cron 一致：168=7天档起，72=3天档起，24=1天档起 */
const PUSH_REMINDER_PRESETS = [
  { value: -1, label: '凡是有未兑换均提醒' },
  { value: 168, label: '到期前 7 天内（推荐）' },
  { value: 72, label: '到期前 3 天内' },
  { value: 24, label: '到期前 1 天内' },
] as const

function normalizeStoredPushReminderHours(h: number): number {
  if (h === -1 || h === 0) return -1
  if (h === 24 || h === 72 || h === 168) return h
  if (h === 1 || h === 6 || h === 12) return 24
  return 168
}

function parseExpiryMs(expiryAt?: string): number | null {
  if (!expiryAt) return null
  // 若后端返回无时区字符串，按中国时区解释
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(expiryAt)
  const normalized = hasTz ? expiryAt : `${expiryAt}+08:00`
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? null : ms
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

function getServerFilterLabel(serverCode: string): string {
  if (serverCode === 'SN_GL' || serverCode === 'IN_GL') return '国际服'
  return SERVER_LABEL_MAP[serverCode] || serverCode
}

function syncServerSettingsToServiceWorker(settings: ServerSettings) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  const payload = { type: 'SYNC_SERVER_SETTINGS', payload: settings }
  navigator.serviceWorker.controller?.postMessage(payload)
  void navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage(payload)
    reg.waiting?.postMessage(payload)
    reg.installing?.postMessage(payload)
  })
}

export default function Dashboard() {
  const [selectedGame, setSelectedGame] = useState<string>('未领取')
  const [currentSubFilter, setCurrentSubFilter] = useState<string>('ALL')
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'unsupported'>('default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [feedbackContent, setFeedbackContent] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [postcardPreview, setPostcardPreview] = useState('')
  const [postcardNickname, setPostcardNickname] = useState('')
  const [postcardFile, setPostcardFile] = useState<File | null>(null)
  const [uploadingPostcard, setUploadingPostcard] = useState(false)
  const [featuredImages, setFeaturedImages] = useState<FeaturedImage[]>([])
  const [postcardLightbox, setPostcardLightbox] = useState<FeaturedImage | null>(null)
  const [postcardLightboxLoaded, setPostcardLightboxLoaded] = useState(false)
  const [preferredGames, setPreferredGames] = useState<string[]>(['无限暖暖', '闪耀暖暖'])
  const [serverSettings, setServerSettings] = useState<ServerSettings>(DEFAULT_SERVER_SETTINGS)
  const [warningThresholdHours, setWarningThresholdHours] = useState(24)
  const [pushReminderHours, setPushReminderHours] = useState<number>(168)
  const [highValueOnly, setHighValueOnly] = useState(false)
  const [codes, setCodes] = useState<Code[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pwaBannerPad, setPwaBannerPad] = useState(false)
  const { claimedIds, claimCode, unclaimCode } = useClaimedCodes()
  const { toast } = useToast()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        preferredGames?: string[]
        warningThresholdHours?: number
        pushReminderHours?: number
        highValueOnly?: boolean
      }
      if (Array.isArray(parsed.preferredGames)) setPreferredGames(parsed.preferredGames)
      if (typeof parsed.warningThresholdHours === 'number') setWarningThresholdHours(parsed.warningThresholdHours)
      if (typeof parsed.pushReminderHours === 'number') {
        setPushReminderHours(normalizeStoredPushReminderHours(parsed.pushReminderHours))
      }
      if (typeof parsed.highValueOnly === 'boolean') setHighValueOnly(parsed.highValueOnly)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SERVER_SETTINGS_KEY)
      if (!raw) {
        setServerSettings(DEFAULT_SERVER_SETTINGS)
        return
      }
      const parsed = JSON.parse(raw) as Partial<ServerSettings>
      setServerSettings(normalizeServerSettings(parsed))
    } catch {
      setServerSettings(DEFAULT_SERVER_SETTINGS)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        preferredGames,
        warningThresholdHours,
        pushReminderHours,
        highValueOnly,
      }),
    )
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nikki-badge-sync'))
  }, [preferredGames, warningThresholdHours, pushReminderHours, highValueOnly])

  useEffect(() => {
    localStorage.setItem(SERVER_SETTINGS_KEY, JSON.stringify(serverSettings))
    syncServerSettingsToServiceWorker(serverSettings)
  }, [serverSettings])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    listCodes(selectedGame)
      .then((rows) => {
        if (!active) return
        setCodes(rows)
      })
      .catch((err: unknown) => {
        if (!active) return
        const message = err instanceof Error ? err.message : '加载失败'
        setLoadError(message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedGame])

  useEffect(() => {
    listFeaturedImages()
      .then(setFeaturedImages)
      .catch(() => {
        // ignore wall errors
      })
  }, [])

  useEffect(() => {
    if (!supportOpen) setPostcardNickname('')
  }, [supportOpen])

  useEffect(() => {
    setPostcardLightboxLoaded(false)
  }, [postcardLightbox?.id, postcardLightbox?.imageUrl])

  useEffect(() => {
    if (!postcardLightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPostcardLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [postcardLightbox])

  useEffect(() => {
    warnIfVapidKeysMissingInClient()
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported')
      return
    }
    void (async () => {
      if (Notification.permission !== 'granted') return
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) setPushStatus('granted')
      } catch {
        // ignore
      }
    })()
  }, [])

  const baseFilteredCodes = useMemo(() => {
    const nowMs = Date.now()
    const selectedServers = {
      闪耀暖暖: new Set(serverSettings.shining),
      无限暖暖: new Set(serverSettings.infinity),
    }
    return [...codes]
      .filter((item) => preferredGames.includes(item.gameName))
      .filter((item) => {
        const gameServers = selectedServers[item.gameName as '闪耀暖暖' | '无限暖暖']
        if (!gameServers || gameServers.size === 0) return true
        const server = item.server || getDefaultServerByGame(item.gameName)
        return gameServers.has(server)
      })
      .filter((item) => (highValueOnly ? Boolean(item.diamondReward?.trim()) : true))
      .filter((item) => {
        const expiryMs = parseExpiryMs(item.expiryAt)
        return expiryMs === null || expiryMs > nowMs
      })
      .filter((item) => (selectedGame === '未领取' ? !claimedIds.has(item.id) : true))
  }, [claimedIds, codes, preferredGames, highValueOnly, selectedGame, serverSettings])

  const unclaimedGameServerFilters = useMemo(() => {
    if (selectedGame !== '未领取') return []
    const grouped = new Map<string, { key: string; label: string }>()
    for (const item of baseFilteredCodes) {
      const serverCode = item.server || getDefaultServerByGame(item.gameName)
      const key = `${item.gameName}__${serverCode}`
      if (grouped.has(key)) continue
      const serverLabel = getServerFilterLabel(serverCode)
      grouped.set(key, { key, label: `${item.gameName} - ${serverLabel}` })
    }
    return [...grouped.values()]
  }, [baseFilteredCodes, selectedGame])

  const gameTabServerFilters = useMemo(() => {
    if (selectedGame === '闪耀暖暖') {
      return [...new Set(serverSettings.shining)].map((serverCode) => ({
        key: serverCode,
        label: getServerFilterLabel(serverCode),
      }))
    }
    if (selectedGame === '无限暖暖') {
      return [...new Set(serverSettings.infinity)].map((serverCode) => ({
        key: serverCode,
        label: getServerFilterLabel(serverCode),
      }))
    }
    return []
  }, [selectedGame, serverSettings])

  const activeSubFilters = selectedGame === '未领取' ? unclaimedGameServerFilters : gameTabServerFilters

  const sortedCodes = useMemo(() => {
    const list = baseFilteredCodes.filter((item) => {
      if (currentSubFilter === 'ALL') return true
      if (selectedGame === '未领取') {
        const serverCode = item.server || getDefaultServerByGame(item.gameName)
        return `${item.gameName}__${serverCode}` === currentSubFilter
      }
      const serverCode = item.server || getDefaultServerByGame(item.gameName)
      return serverCode === currentSubFilter
    })
    return list.sort((a, b) => {
      const aClaimed = claimedIds.has(a.id)
      const bClaimed = claimedIds.has(b.id)
      if (aClaimed && !bClaimed) return 1
      if (!aClaimed && bClaimed) return -1
      if (a.isHighValue && !b.isHighValue) return -1
      if (!a.isHighValue && b.isHighValue) return 1
      if (a.expiryAt && b.expiryAt) return new Date(a.expiryAt).getTime() - new Date(b.expiryAt).getTime()
      if (a.expiryAt) return -1
      if (b.expiryAt) return 1
      return 0
    })
  }, [baseFilteredCodes, claimedIds, currentSubFilter, selectedGame])

  const showSubFilterBar = activeSubFilters.length > 1

  useEffect(() => {
    if (currentSubFilter === 'ALL') return
    if (!activeSubFilters.some((item) => item.key === currentSubFilter)) {
      setCurrentSubFilter('ALL')
    }
  }, [activeSubFilters, currentSubFilter])

  const togglePreferredGame = (game: string, checked: boolean) => {
    setPreferredGames((prev) => {
      const next = checked ? [...new Set([...prev, game])] : prev.filter((g) => g !== game)
      return next.length ? next : prev
    })
  }

  const toggleServerPreference = (game: 'shining' | 'infinity', code: string, checked: boolean) => {
    setServerSettings((prev) => {
      const nextList = checked ? [...new Set([...prev[game], code])] : prev[game].filter((item) => item !== code)
      return {
        ...prev,
        [game]: nextList.length ? nextList : [...DEFAULT_SERVER_SETTINGS[game]],
      }
    })
  }

  const getServerBadgeText = (code: Code): string | undefined => {
    const gameKey = code.gameName === '闪耀暖暖' ? 'shining' : code.gameName === '无限暖暖' ? 'infinity' : null
    if (!gameKey) return undefined
    if (serverSettings[gameKey].length <= 1) return undefined
    const serverCode = code.server || getDefaultServerByGame(code.gameName)
    return SERVER_LABEL_MAP[serverCode] || serverCode
  }

  const handleJump = useCallback(
    (url: string) => {
      if (typeof window === 'undefined') return
      const ua = window.navigator.userAgent.toLowerCase()
      const mobileByUA = /iphone|ipad|ipod|android|mobile|harmonyos/i.test(ua)
      const mobileByWidth = window.innerWidth <= 900
      const isMobile = mobileByUA || mobileByWidth
      if (!isMobile) {
        toast({
          title: '网页端暂不支持跳转，请在手机端 App 中查看',
        })
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    [toast],
  )

  const handleEnablePush = async () => {
    warnIfVapidKeysMissingInClient()

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported')
      toast({ title: '您的浏览器不支持 Web 推送（缺少 Notification / Service Worker / PushManager）', variant: 'destructive' })
      return
    }

    if (!isVapidPublicKeyConfigured()) {
      toast({
        title: '未配置 VAPID 公钥',
        description: '请在构建环境变量中设置 VITE_VAPID_PUBLIC_KEY，并查看控制台说明。',
        variant: 'destructive',
      })
      return
    }

    try {
      const effectivePushHours = pushReminderHours === -1 ? 168 : pushReminderHours
      const ok = await subscribePushAndPersist(effectivePushHours)
      if (ok) {
        setPushStatus('granted')
        toast({ title: '推送已开启，订阅已保存 🌸' })
      } else {
        toast({ title: '未授予通知权限或已取消', variant: 'destructive' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '订阅或保存失败'
      toast({ title: message, variant: 'destructive' })
    }
  }

  const handleSubmitFeedback = async () => {
    if (!feedbackContent.trim()) {
      toast({ title: '请先输入内容', variant: 'destructive' })
      return
    }
    setSendingFeedback(true)
    try {
      await submitFeedback(feedbackContent)
      toast({ title: '发送成功，管理员稍后会进行验证' })
      setFeedbackContent('')
      setFeedbackOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送失败'
      toast({ title: message, variant: 'destructive' })
    } finally {
      setSendingFeedback(false)
    }
  }

  const handleSelectPostcard: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] ?? null
    setPostcardFile(file)
    if (!file) {
      setPostcardPreview('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPostcardPreview(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  const handleSubmitPostcard = async () => {
    if (!postcardFile) {
      toast({ title: '请先选择图片', variant: 'destructive' })
      return
    }
    setUploadingPostcard(true)
    try {
      await submitImageFeeding(postcardFile, { nickname: postcardNickname })
      toast({
        title: '明信片已送达 ✨',
        description: '你的心意作者都收到啦，愿搭配之力与你同在～',
      })
      setPostcardFile(null)
      setPostcardPreview('')
      setPostcardNickname('')
      setSupportOpen(false)
    } catch (err) {
      console.error('[handleSubmitPostcard] 投喂图片上传失败，完整错误:', err)
      const message = err instanceof Error ? err.message : '上传失败'
      toast({ title: message, variant: 'destructive' })
    } finally {
      setUploadingPostcard(false)
    }
  }

  const handlePullRefresh = useCallback(async () => {
    try {
      const rows = await listCodes(selectedGame)
      setCodes(rows)
      setLoadError(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载失败'
      toast({ title: '刷新失败', description: message, variant: 'destructive' })
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nikki-badge-sync'))
    }
    const swNew = await checkServiceWorkerUpdateAvailable()
    if (swNew) {
      toast({
        title: '发现新版本',
        description: '点击更新以加载最新功能。',
        action: { label: '更新', onClick: () => activateWaitingServiceWorkerAndReload() },
      })
    }
    void listFeaturedImages().then(setFeaturedImages).catch(() => {})
  }, [selectedGame, toast])

  const pullRefreshEnabled = !settingsOpen && !guideOpen && !feedbackOpen && !supportOpen
  const { containerRef, indicatorHeight, showSpinner } = usePullToRefresh({
    enabled: pullRefreshEnabled,
    onRefresh: handlePullRefresh,
  })

  return (
    <>
    <Layout
      bottomInsetPad={pwaBannerPad}
      rightSlot={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">投稿/反馈</span>
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            aria-label="使用指南"
            className="flex items-center gap-2 rounded-xl border border-zinc-300/70 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-primary/40 hover:bg-white hover:text-foreground active:scale-95"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">指南</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            className="flex items-center justify-center rounded-xl border border-zinc-300/70 bg-zinc-200/95 px-3 py-2 text-zinc-700 shadow-sm transition-all hover:border-zinc-400 hover:bg-zinc-300 hover:text-zinc-900 active:scale-95"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div ref={containerRef} className="relative touch-pan-y">
        <div
          className="pointer-events-none flex justify-center overflow-hidden transition-[height] duration-300 ease-out"
          style={{ height: indicatorHeight }}
          aria-hidden
        >
          <Loader2
            className={`mb-1 h-7 w-7 self-end text-primary ${showSpinner ? 'animate-spin' : ''}`}
            style={{ opacity: indicatorHeight > 6 ? Math.min(1, indicatorHeight / 36) : 0 }}
          />
        </div>

      <div className="mb-10 flex flex-col justify-between gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div>
          <h1 className="mb-4 font-display text-4xl font-extrabold text-foreground md:text-5xl">最新兑换码</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">不要错过免费的钻石鸭！赶在过期前领取吧~</p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:items-end">
          <Button
            onClick={handleEnablePush}
            disabled={pushStatus === 'granted' || pushStatus === 'unsupported'}
            className={`rounded-full px-6 py-3 font-medium shadow-sm transition-all active:scale-[0.98] ${
              pushStatus === 'granted'
                ? 'cursor-default border border-emerald-200/80 bg-emerald-50 text-emerald-800'
                : 'bg-foreground text-background hover:opacity-90'
            }`}
          >
            <Bell className="h-5 w-5" />
            {pushStatus === 'granted' ? '推送已开启 ✓' : pushStatus === 'unsupported' ? '您的浏览器不支持推送' : '开启推送提醒'}
          </Button>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2 overflow-x-auto pb-2">
        {GAME_FILTERS.map((game) => (
          <button
            key={game}
            onClick={() => {
              setSelectedGame(game)
              setCurrentSubFilter('ALL')
            }}
            className={`rounded-full border px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-300 active:scale-[0.98] ${
              selectedGame === game
                ? 'border-transparent bg-foreground text-background shadow-sm shadow-foreground/10'
                : 'border-border/80 bg-white/90 text-muted-foreground hover:border-zinc-300 hover:bg-white'
            }`}
          >
            {game}
          </button>
        ))}
      </div>

      {showSubFilterBar ? (
        <div className="mb-7 flex items-center gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setCurrentSubFilter('ALL')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              currentSubFilter === 'ALL'
                ? 'bg-pink-500 text-white shadow-sm shadow-pink-400/40'
                : 'border border-gray-300 bg-gray-200 text-gray-700'
            }`}
          >
            全部
          </button>
          {activeSubFilters.map((filterItem) => (
            <button
              key={filterItem.key}
              type="button"
              onClick={() => setCurrentSubFilter(filterItem.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                currentSubFilter === filterItem.key
                  ? 'bg-pink-500 text-white shadow-sm shadow-pink-400/40'
                  : 'border border-gray-300 bg-gray-200 text-gray-700'
              }`}
            >
              {filterItem.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="glass-card mb-6 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
        <span>💡</span>
        <span>提示：点击复制后，该码将自动标记为“已领取”并移至末尾。</span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-primary">
          <Loader2 className="mb-4 h-10 w-10 animate-spin" />
          <p className="animate-pulse font-semibold text-muted-foreground">加载中...</p>
        </div>
      ) : loadError ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-3xl py-12 text-center">
          <p className="font-bold text-destructive">加载失败：{loadError}</p>
          <p className="mt-2 text-sm text-muted-foreground">请先检查 Supabase URL / Key 是否配置正确。</p>
        </motion.div>
      ) : sortedCodes.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card flex flex-col items-center justify-center rounded-3xl py-16 text-center">
          <h2 className="mb-2 font-display text-2xl font-bold text-foreground">
            {selectedGame === '未领取' ? '暂无待领取兑换码' : '暂无有效兑换码'}
          </h2>
          <p className="max-w-md text-muted-foreground">
            {selectedGame === '未领取'
              ? '在您关注的游戏里，目前没有尚未领取的有效兑换码；可能已全部领完，可切换到具体游戏查看含已领取的完整列表。'
              : `目前${selectedGame}暂时没有有效的兑换码。请稍后再来看看吧！`}
          </p>
        </motion.div>
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {sortedCodes.map((code) => (
              <CodeCard
                key={code.id}
                code={code}
                serverBadgeText={getServerBadgeText(code)}
                isClaimed={claimedIds.has(code.id)}
                onClaim={claimCode}
                onUnclaim={unclaimCode}
                warningThresholdHours={warningThresholdHours}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {guideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-md sm:items-center sm:p-4 sm:bg-black/35"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGuideOpen(false)
          }}
        >
          <div
            className="glass-card flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col rounded-t-[1.75rem] border border-white/60 bg-white/85 shadow-2xl backdrop-blur-xl sm:max-h-[min(88dvh,680px)] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-4 sm:px-6">
              <h2 id="guide-title" className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
                NikkiCode 使用指南
              </h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
              <p className="mb-6 text-[15px] leading-relaxed text-muted-foreground">
                NikkiCode 是你的兑换码贴身管家，帮你守护每一份星光福利。
              </p>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-foreground">
                  <span aria-hidden>✨</span>
                  核心功能
                </h3>
                <ul className="space-y-2.5 text-[15px] leading-relaxed text-foreground/90">
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">设置与提醒</span>
                      ：右上角设置可切换关注的游戏、区服、兑换码红点提醒时间等，记得点击开启推送哦~
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">暖心投喂</span>
                      ：支持投喂明信片功能，和大家一起分享你的搭配吧~
                    </span>
                  </li>
                </ul>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-foreground">
                  <span aria-hidden>🚀</span>
                  如何添加为 APP 使用
                </h3>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
                    <p className="mb-2 text-sm font-semibold text-foreground">🍎 iOS 用户（Safari）</p>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">
                      点击底部「分享」按钮 →「添加到主屏幕」→ 启动并允许通知。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
                    <p className="mb-2 text-sm font-semibold text-foreground">🤖 安卓用户（Chrome / Edge）</p>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">
                      点击右上角「三个点」→「安装应用」或「添加到主屏幕」。
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-foreground">
                  <span aria-hidden>💡</span>
                  小贴士
                </h3>
                <ul className="space-y-2.5 text-[15px] leading-relaxed text-foreground/90">
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">刷新数据</span>
                      ：在主界面向下拉动即可同步；如果下拉无法刷新，请从后台关闭并重启 APP。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">消除红点</span>
                      ：将兑换码标记为「已兑换」，红点数字将自动递减。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">查看已领取兑换码</span>
                      ：点击复制后兑换码将自动标记为已领取，点击进入无限暖暖/闪耀暖暖列表，可以查看已经兑换过的兑换码哦~
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">列表与红点说明</span>
                      ：未领取列表显示所有关注区服的有效兑换码，红点仅提示即将到期的部分。
                    </span>
                  </li>
                </ul>
              </section>

              <p className="mt-8 border-t border-border/50 pt-4 text-center text-xs tabular-nums text-muted-foreground">
                v{APP_VERSION} (Stable)
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="glass-card w-full max-w-md rounded-3xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">设置</h3>
              <button type="button" onClick={() => setSettingsOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                关闭
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-2 font-bold">关注的游戏</p>
                <label className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferredGames.includes('无限暖暖')}
                    onChange={(e) => togglePreferredGame('无限暖暖', e.target.checked)}
                  />
                  无限暖暖
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferredGames.includes('闪耀暖暖')}
                    onChange={(e) => togglePreferredGame('闪耀暖暖', e.target.checked)}
                  />
                  闪耀暖暖
                </label>
              </div>

              <div>
                <p className="mb-1 font-bold">区服偏好设置</p>
                <p className="mb-2 text-xs text-muted-foreground">勾选你关注的区服，列表会实时按区服过滤。</p>
                <div className="rounded-xl border border-border bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">闪耀暖暖</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SHINING_SERVER_OPTIONS.map((item) => (
                      <label key={item.code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={serverSettings.shining.includes(item.code)}
                          onChange={(e) => toggleServerPreference('shining', item.code, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-border bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">无限暖暖</p>
                  <div className="grid grid-cols-2 gap-2">
                    {INFINITY_SERVER_OPTIONS.map((item) => (
                      <label key={item.code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={serverSettings.infinity.includes(item.code)}
                          onChange={(e) => toggleServerPreference('infinity', item.code, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 font-bold">到期提醒时间</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  若存在 7 天 / 3 天 / 1 天内即将到期的兑换码，开启推送后，将收到推送提醒，并在APP显示未读小红点。
                </p>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-white px-3"
                  value={pushReminderHours}
                  onChange={async (e) => {
                    const v = Number(e.target.value)
                    setPushReminderHours(v)
                    try {
                      if (v === -1) {
                        toast({ title: '已保存到本机', description: '“凡是有未兑换均提醒”仅影响红点与列表筛选，不同步到推送服务端。' })
                        return
                      }
                      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                        toast({ title: '已保存到本机', description: '当前环境不支持推送，开启推送后将使用此选项。' })
                        return
                      }
                      const reg = await navigator.serviceWorker.ready
                      const sub = await reg.pushManager.getSubscription()
                      if (!sub) {
                        toast({ title: '已保存到本机', description: '开启推送后将在订阅时写入服务器。' })
                        return
                      }
                      await updatePushPreference(sub.endpoint, v)
                      toast({ title: '到期提醒偏好已同步' })
                    } catch (err) {
                      const message = err instanceof Error ? err.message : '同步失败'
                      toast({ title: message, variant: 'destructive' })
                    }
                  }}
                >
                  {PUSH_REMINDER_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 font-bold">兑换码高亮设置</p>
                <p className="mb-2 text-xs text-muted-foreground">仅影响列表里兑换码卡片的「即将过期」高亮，与推送、红点显示无关。</p>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-white px-3"
                  value={warningThresholdHours}
                  onChange={(e) => setWarningThresholdHours(Number(e.target.value))}
                >
                  <option value={0}>关闭</option>
                  <option value={1}>1 小时前</option>
                  <option value={6}>6 小时前</option>
                  <option value={12}>12 小时前</option>
                  <option value={24}>24 小时前</option>
                  <option value={72}>3 天前</option>
                  <option value={168}>7 天前</option>
                </select>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
                <span className="font-bold">仅显示含钻石兑换码</span>
                <input type="checkbox" checked={highValueOnly} onChange={(e) => setHighValueOnly(e.target.checked)} />
              </label>

              <p className="border-t border-border/60 pt-4 text-center text-xs tabular-nums text-muted-foreground">
                v{APP_VERSION} (Stable)
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {feedbackOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="glass-card w-full max-w-lg rounded-3xl p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-bold">玩家投稿信箱</h3>
              <button type="button" onClick={() => setFeedbackOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                关闭
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">如果你发现了新兑换码，或有任何使用建议，欢迎在这里告诉我们。</p>
            <textarea
              value={feedbackContent}
              onChange={(e) => setFeedbackContent(e.target.value)}
              placeholder="例如：无限暖暖新码 NIKKI888，来源官方微博..."
              className="min-h-36 w-full rounded-2xl border border-input bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
            />
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={handleSubmitFeedback} disabled={sendingFeedback} className="rounded-xl">
                {sendingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="glass-card max-h-[min(90dvh,640px)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-bold">投喂照片</h3>
              <button type="button" onClick={() => setSupportOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                关闭
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">传一张你最得意的女儿截图，和大家分享你的搭配吧！</p>
              <input type="file" accept="image/*" onChange={handleSelectPostcard} className="block w-full rounded-xl border border-input bg-white p-2" />
              {postcardPreview ? <img src={postcardPreview} alt="预览" className="max-h-56 w-full rounded-2xl object-cover" /> : null}
              <input
                type="text"
                value={postcardNickname}
                onChange={(e) => setPostcardNickname(e.target.value)}
                maxLength={48}
                placeholder="留下你的昵称吧 (可选)"
                className="h-11 w-full rounded-xl border border-input bg-white px-4 text-sm placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40 focus:outline-none"
              />
              <Button type="button" onClick={handleSubmitPostcard} disabled={uploadingPostcard}>
                {uploadingPostcard ? <Loader2 className="h-4 w-4 animate-spin" /> : '上传投喂照片'}
              </Button>
              <p className="text-xs text-muted-foreground">上传的照片经作者审核后，有可能会展示给其他使用这个工具的玩家哦。</p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-12">
        <h3 className="mb-3 text-xl font-bold">搭配师们的能量投喂</h3>
        <div className="glass-card flex gap-3 overflow-x-auto rounded-2xl p-3">
          {featuredImages.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">还没有精选明信片，期待你的第一张投喂~</p>
          ) : (
            featuredImages.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPostcardLightbox(item)}
                className="group relative shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0 text-left shadow-sm ring-2 ring-transparent transition-all hover:ring-primary/35 focus-visible:ring-primary/50 focus-visible:outline-none"
              >
                <img
                  src={item.imageUrl}
                  alt={`${postcardDisplayName(item.nickname)} 的投喂`}
                  className="h-40 w-28 rounded-xl object-cover transition-transform group-hover:scale-[1.02] group-active:scale-[0.98]"
                  loading="lazy"
                />
                <span className="mt-1 block max-w-[7rem] truncate px-0.5 text-center font-display text-[11px] italic tracking-wide text-primary/75">
                  {postcardDisplayName(item.nickname)}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="rounded-full bg-pink-500 px-5 py-2 text-white shadow-sm shadow-pink-400/40 hover:bg-pink-500/90"
          >
            我也要投喂照片
          </Button>
        </div>
      </section>

      <section className="pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] mt-10 text-center text-xs text-gray-400">
        <p>
          更多最新信息
          <button
            type="button"
            onClick={() => handleJump(XHS_GROUP_URL)}
            className="ml-1 rounded px-1.5 py-0.5 text-pink-400 underline underline-offset-2 transition hover:text-pink-500"
          >
            @精准日叠自我攻略攻略组
          </button>
        </p>
        <p className="mt-1">
          技术开发反馈
          <button
            type="button"
            onClick={() => handleJump(XHS_DEV_URL)}
            className="ml-1 rounded px-1.5 py-0.5 text-pink-400 underline underline-offset-2 transition hover:text-pink-500"
          >
            @TAT
          </button>
        </p>
      </section>
      </div>
    </Layout>
    <PwaInstallBanner onVisibleChange={setPwaBannerPad} />

      {postcardLightbox ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/78 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="明信片大图预览"
          onClick={() => setPostcardLightbox(null)}
        >
          <button
            type="button"
            aria-label="关闭预览"
            onClick={(e) => {
              e.stopPropagation()
              setPostcardLightbox(null)
            }}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/22"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <div className="relative flex max-h-[min(88dvh,900px)] max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex min-h-[min(40dvh,240px)] min-w-[min(72vw,200px)] max-w-full items-center justify-center sm:min-h-[280px]">
              {!postcardLightboxLoaded ? (
                <Loader2 className="absolute h-10 w-10 animate-spin text-white/75" aria-hidden />
              ) : null}
              <img
                src={postcardLightbox.imageUrl}
                alt="明信片大图"
                className={`max-h-[min(78dvh,780px)] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/15 transition-opacity duration-300 ${postcardLightboxLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setPostcardLightboxLoaded(true)}
              />
            </div>
            <p className="mt-5 max-w-[min(92vw,520px)] text-center text-sm text-white/90">
              <span className="text-white/55">来自：</span>
              <span className="font-display text-base font-medium italic tracking-wide text-[#fce7f3] drop-shadow-md">
                {postcardDisplayName(postcardLightbox.nickname)}
              </span>
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
