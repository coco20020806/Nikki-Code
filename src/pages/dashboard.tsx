import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Heart,
  HelpCircle,
  Loader2,
  MessageCircleMore,
  MessageSquare,
  Send,
  Settings,
  WalletCards,
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

function postcardDisplayName(nickname: string | null | undefined): string {
  const t = (nickname ?? '').trim()
  return t.length > 0 ? t : '热心玩家'
}

/** 与每日巡逻 Cron 一致：168=7天档起，72=3天档起，24=1天档起 */
const PUSH_REMINDER_PRESETS = [
  { value: 168, label: '到期前 7 天内（推荐）' },
  { value: 72, label: '到期前 3 天内' },
  { value: 24, label: '到期前 1 天内' },
] as const

function normalizeStoredPushReminderHours(h: number): number {
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

export default function Dashboard() {
  const [selectedGame, setSelectedGame] = useState<string>('未领取')
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'unsupported'>('default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportTab, setSupportTab] = useState<'coffee' | 'postcard'>('coffee')
  const [supportPayMethod, setSupportPayMethod] = useState<'wechat' | 'alipay'>('wechat')
  const [supportQrExpanded, setSupportQrExpanded] = useState(false)
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
    if (!supportOpen) {
      setSupportQrExpanded(false)
      setPostcardNickname('')
    }
  }, [supportOpen])

  useEffect(() => {
    if (supportTab !== 'coffee') setSupportQrExpanded(false)
  }, [supportTab])

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

  const sortedCodes = useMemo(() => {
    const nowMs = Date.now()
    const list = [...codes]
      .filter((item) => preferredGames.includes(item.gameName))
      .filter((item) => (highValueOnly ? Boolean(item.diamondReward?.trim()) : true))
      .filter((item) => {
        const expiryMs = parseExpiryMs(item.expiryAt)
        return expiryMs === null || expiryMs > nowMs
      })
      .filter((item) => (selectedGame === '未领取' ? !claimedIds.has(item.id) : true))

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
  }, [claimedIds, codes, preferredGames, highValueOnly, selectedGame])

  const togglePreferredGame = (game: string, checked: boolean) => {
    setPreferredGames((prev) => {
      const next = checked ? [...new Set([...prev, game])] : prev.filter((g) => g !== game)
      return next.length ? next : prev
    })
  }

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
      const ok = await subscribePushAndPersist(pushReminderHours)
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
            onClick={() => setSupportOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground"
          >
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">赞助/投喂</span>
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
            onClick={() => setSelectedGame(game)}
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
                      <span className="font-medium text-foreground">高亮兑换码</span>
                      ：可设置时间窗口标记即将过期兑换码高亮。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">智能到期提醒</span>
                      ：在设置中可设置提醒时间，在对应时间内有未兑换兑换码将推送。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">持久化红点</span>
                      ：只要还有没领的码，红点将持续存在。
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">·</span>
                    <span>
                      <span className="font-medium text-foreground">暖心投喂</span>
                      ：支持投喂明信片功能，和开发者分享你的精美搭配与快乐。
                    </span>
                  </li>
                </ul>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-foreground">
                  <span aria-hidden>🚀</span>
                  快速上手
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
                <p className="mb-2 font-bold">到期提醒时间</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  若存在 7 天 / 3 天 / 1 天内即将到期的兑换码，开启推送后，将收到推送提醒，并在APP显示未读小红点。
                </p>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-white px-3"
                  value={pushReminderHours}
                  onChange={async (e) => {
                    const v = Number(e.target.value) as 24 | 72 | 168
                    setPushReminderHours(v)
                    try {
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
              <h3 className="text-xl font-bold">支持作者</h3>
              <button type="button" onClick={() => setSupportOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                关闭
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSupportTab('coffee')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${supportTab === 'coffee' ? 'bg-foreground text-background' : 'bg-white text-muted-foreground'}`}
              >
                投喂体力药水
              </button>
              <button
                type="button"
                onClick={() => setSupportTab('postcard')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${supportTab === 'postcard' ? 'bg-foreground text-background' : 'bg-white text-muted-foreground'}`}
              >
                投喂精美明信片
              </button>
            </div>

            {supportTab === 'coffee' ? (
              <div className="space-y-4 text-sm">
                <h4 className="text-base font-bold text-foreground">打赏作者（服务器也是要烧钱的呜呜）</h4>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setSupportPayMethod('wechat')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white shadow-sm transition-all active:scale-95 sm:px-4 ${
                      supportPayMethod === 'wechat'
                        ? 'bg-[#07C160] shadow-[#07C160]/35 ring-2 ring-[#07C160]/30'
                        : 'bg-[#07C160] hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#07C160]/40'
                    }`}
                  >
                    <MessageCircleMore className="h-4 w-4 shrink-0" />
                    微信支付
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupportPayMethod('alipay')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white shadow-sm transition-all active:scale-95 sm:px-4 ${
                      supportPayMethod === 'alipay'
                        ? 'bg-[#1677FF] shadow-[#1677FF]/35 ring-2 ring-[#1677FF]/30'
                        : 'bg-[#1677FF] hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#1677FF]/40'
                    }`}
                  >
                    <WalletCards className="h-4 w-4 shrink-0" />
                    支付宝
                  </button>
                </div>
                {!supportQrExpanded ? (
                  <button
                    type="button"
                    onClick={() => setSupportQrExpanded(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-white/60 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-white/90 active:scale-[0.98]"
                  >
                    <span>展开{supportPayMethod === 'wechat' ? '微信' : '支付宝'}收款码</span>
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </button>
                ) : (
                  <>
                    <div className="mx-auto flex w-full max-w-[200px] flex-col items-center sm:max-w-[220px]">
                      <div className="glass-card w-full overflow-hidden rounded-2xl p-2 shadow-md shadow-black/10">
                        <img
                          src={supportPayMethod === 'wechat' ? '/wechat.jpg' : '/alipay.jpg'}
                          alt={supportPayMethod === 'wechat' ? '微信支付码' : '支付宝支付码'}
                          className="mx-auto max-h-[min(38vh,200px)] w-full rounded-xl object-contain sm:max-h-[220px]"
                        />
                      </div>
                    </div>
                    <p className="text-center text-xs text-muted-foreground/90">长按保存图片，打开 App 扫码支持作者</p>
                    <button
                      type="button"
                      onClick={() => setSupportQrExpanded(false)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      收起收款码
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">传一张你最得意的女儿截图，给作者充充电吧！</p>
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
                  {uploadingPostcard ? <Loader2 className="h-4 w-4 animate-spin" /> : '上传投喂图片'}
                </Button>
                <p className="text-xs text-muted-foreground">上传的图片经作者审核后，有可能会展示给其他使用这个工具的玩家哦。</p>
              </div>
            )}
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
