import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Loader2 } from 'lucide-react'
import { CodeCard } from '@/components/code-card'
import { Layout } from '@/components/layout'
import { useClaimedCodes } from '@/hooks/use-claimed-codes'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { listCodes } from '@/lib/codes-api'
import type { Code } from '@/types/code'

const GAME_FILTERS = ['全部', '无限暖暖', '闪耀暖暖']

export default function Dashboard() {
  const [selectedGame, setSelectedGame] = useState<string>('全部')
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'unsupported'>('default')
  const [codes, setCodes] = useState<Code[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { claimedIds, claimCode, unclaimCode } = useClaimedCodes()
  const { toast } = useToast()

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
    return [...codes].sort((a, b) => {
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
  }, [claimedIds, codes])

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

  return (
    <Layout>
      <div className="mb-10 flex flex-col justify-between gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div>
          <h1 className="mb-4 font-display text-4xl font-extrabold text-foreground md:text-5xl">最新兑换码</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">不要错过免费的钻石、体力等神奇道具！赶在过期前领取吧。</p>
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
              <CodeCard key={code.id} code={code} isClaimed={claimedIds.has(code.id)} onClaim={claimCode} onUnclaim={unclaimCode} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </Layout>
  )
}
