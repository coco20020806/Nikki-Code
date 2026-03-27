import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Loader2, MessageSquare, Send, Settings } from 'lucide-react'
import { CodeCard } from '@/components/code-card'
import { Layout } from '@/components/layout'
import { useClaimedCodes } from '@/hooks/use-claimed-codes'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { listCodes, submitFeedback } from '@/lib/codes-api'
import type { Code } from '@/types/code'

const GAME_FILTERS = ['全部', '无限暖暖', '闪耀暖暖']
const STORAGE_KEY = 'nikki_preferences_v1'

export default function Dashboard() {
  const [selectedGame, setSelectedGame] = useState<string>('全部')
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'unsupported'>('default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackContent, setFeedbackContent] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [preferredGames, setPreferredGames] = useState<string[]>(['无限暖暖', '闪耀暖暖'])
  const [warningThresholdHours, setWarningThresholdHours] = useState(24)
  const [highValueOnly, setHighValueOnly] = useState(false)
  const [codes, setCodes] = useState<Code[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { claimedIds, claimCode, unclaimCode } = useClaimedCodes()
  const { toast } = useToast()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        preferredGames?: string[]
        warningThresholdHours?: number
        highValueOnly?: boolean
      }
      if (Array.isArray(parsed.preferredGames)) setPreferredGames(parsed.preferredGames)
      if (typeof parsed.warningThresholdHours === 'number') setWarningThresholdHours(parsed.warningThresholdHours)
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
        highValueOnly,
      }),
    )
  }, [preferredGames, warningThresholdHours, highValueOnly])

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

  const sortedCodes = useMemo(() => {
    const list = [...codes]
      .filter((item) => preferredGames.includes(item.gameName))
      .filter((item) => (highValueOnly ? Boolean(item.diamondReward?.trim()) : true))

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
  }, [claimedIds, codes, preferredGames, highValueOnly])

  const togglePreferredGame = (game: string, checked: boolean) => {
    setPreferredGames((prev) => {
      const next = checked ? [...new Set([...prev, game])] : prev.filter((g) => g !== game)
      return next.length ? next : prev
    })
  }

  const handleEnablePush = async () => {
    if (!('Notification' in window)) {
      setPushStatus('unsupported')
      toast({ title: '您的浏览器不支持推送通知', variant: 'destructive' })
      return
    }

    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setPushStatus('granted')
      toast({ title: '推送提醒已开启！🌸' })
    } else {
      toast({ title: '请在浏览器设置中允许通知权限', variant: 'destructive' })
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

  return (
    <Layout
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
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      }
    >
      <div className="mb-10 flex flex-col justify-between gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div>
          <h1 className="mb-4 font-display text-4xl font-extrabold text-foreground md:text-5xl">最新兑换码</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">不要错过免费的钻石鸭！赶在过期前领取吧~</p>
        </div>

        <Button
          onClick={handleEnablePush}
          disabled={pushStatus === 'granted' || pushStatus === 'unsupported'}
          className={`rounded-2xl px-6 py-3 ${
            pushStatus === 'granted'
              ? 'cursor-default bg-green-100 text-green-700'
              : ''
          }`}
        >
          <Bell className="h-5 w-5" />
          {pushStatus === 'granted' ? '推送已开启 ✓' : pushStatus === 'unsupported' ? '您的浏览器不支持推送' : '开启推送提醒'}
        </Button>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2 overflow-x-auto pb-2">
        {GAME_FILTERS.map((game) => (
          <button
            key={game}
            onClick={() => setSelectedGame(game)}
            className={`rounded-full px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-all duration-300 ${
              selectedGame === game
                ? 'bg-foreground text-background -translate-y-0.5 shadow-md shadow-foreground/10'
                : 'border-border bg-white text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary'
            }`}
          >
            {game}
          </button>
        ))}
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
          <h2 className="mb-2 font-display text-2xl font-bold text-foreground">暂无有效兑换码</h2>
          <p className="max-w-md text-muted-foreground">
            目前{selectedGame === '全部' ? '所有游戏' : selectedGame}暂时没有有效的兑换码。请稍后再来看看吧！
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
                <p className="mb-2 font-bold">过期预警阈值</p>
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
                <span className="font-bold">仅显示高价值兑换码</span>
                <input type="checkbox" checked={highValueOnly} onChange={(e) => setHighValueOnly(e.target.checked)} />
              </label>
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
    </Layout>
  )
}
