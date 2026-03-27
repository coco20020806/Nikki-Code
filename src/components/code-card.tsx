import { useState } from 'react'
import { motion } from 'framer-motion'
import { addHours, formatDistanceToNow, isBefore, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CheckCircle2, Clock, Copy, ExternalLink, Flag, Gift, Gem } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { Code } from '@/types/code'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { reportIssue } from '@/lib/codes-api'

interface CodeCardProps {
  code: Code
  isClaimed: boolean
  onClaim: (id: number) => void
  onUnclaim: (id: number) => void
  warningThresholdHours: number
}

export function CodeCard({ code, isClaimed, onClaim, onUnclaim, warningThresholdHours }: CodeCardProps) {
  const { toast } = useToast()
  const [reported, setReported] = useState(false)
  const [copied, setCopied] = useState(false)

  const expiryDate = code.expiryAt ? parseISO(code.expiryAt) : null
  const isExpired = expiryDate ? isBefore(expiryDate, new Date()) : false
  const isExpiringSoon =
    expiryDate && warningThresholdHours > 0
      ? isBefore(expiryDate, addHours(new Date(), warningThresholdHours)) && !isExpired
      : false

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.codeText)
      if (!isClaimed) onClaim(code.id)
      setCopied(true)
      toast({ title: '✨ 已复制！', description: '兑换码已复制到剪贴板。' })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: '哎呀！', description: '复制到剪贴板失败。', variant: 'destructive' })
    }
  }

  const handleReport = async () => {
    if (reported) return
    const ok = confirm('确认该码已失效或虚假吗？')
    if (!ok) return
    try {
      await reportIssue(code.id)
      setReported(true)
      toast({ title: '感谢反馈', description: '我们已收到你的报错。' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交失败'
      toast({ title: '提交失败', description: msg, variant: 'destructive' })
    }
  }

  const gameBadgeClass =
    code.gameName === '无限暖暖'
      ? 'bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200'
      : code.gameName === '闪耀暖暖'
        ? 'bg-sky-100 text-sky-700 border border-sky-200'
        : ''

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className={`relative transition-all duration-300 ${
        isClaimed ? 'bg-gray-100/50 opacity-40 shadow-sm grayscale-[0.4]' : 'glass-card shadow-lg hover:shadow-xl hover:shadow-primary/20'
      } ${code.isHighValue && !isClaimed ? 'ring-accent/50 shadow-accent/10 ring-2' : 'border-border/50'}`}
    >
      {code.isHighValue && !isClaimed ? (
        <div className="pointer-events-none absolute top-0 right-0 -mt-10 -mr-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
      ) : null}
      {isClaimed ? (
        <div className="absolute top-3 right-3 z-10 rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700">
          已完成
        </div>
      ) : null}

      <Card className="rounded-3xl border-none bg-transparent shadow-none">
      <div className="p-5 md:p-6">
        <div className="mb-3 flex items-start justify-between gap-2 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <Badge className={`tracking-wider uppercase ${gameBadgeClass}`}>{code.gameName}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {isClaimed ? (
              <>
                <div className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已领取
                </div>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnclaim(code.id)
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground underline underline-offset-2"
                >
                  取消
                </Button>
              </>
            ) : null}
            {expiryDate ? (
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${
                  isExpired
                    ? 'bg-black/5 text-muted-foreground'
                    : isExpiringSoon
                      ? 'animate-pulse bg-destructive/15 text-destructive'
                      : 'bg-secondary/20 text-secondary-foreground'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {isExpired ? '已过期' : formatDistanceToNow(expiryDate, { addSuffix: true, locale: zhCN })}
              </div>
            ) : null}
            {isExpiringSoon ? <Badge variant="destructive">即将过期</Badge> : null}
          </div>
        </div>

        <div className="mb-4 space-y-2">
          {code.diamondReward ? (
            <div className="flex items-start gap-2 text-lg font-extrabold text-foreground md:text-xl">
              <Gem className="mt-1 h-5 w-5 shrink-0 text-primary md:h-6 md:w-6" />
              <p>{code.diamondReward} 钻石</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground">
            {code.otherReward ? (
              <div className="inline-flex items-center gap-2 font-semibold md:text-base">
                <Gift className="h-4 w-4 shrink-0 text-primary" />
                <p>{code.otherReward}</p>
              </div>
            ) : null}
            {!code.diamondReward && !code.otherReward && code.rewardDesc ? (
              <div className="inline-flex items-center gap-2 font-semibold md:text-base">
                <Gift className="h-4 w-4 shrink-0 text-primary" />
                <p>{code.rewardDesc}</p>
              </div>
            ) : null}
            {code.source ? (
              <div className="inline-flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <p>来自 {code.source}</p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={reported}
              onClick={handleReport}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              <Flag className="h-3.5 w-3.5" />
              {reported ? '感谢反馈' : '报错'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div
            onClick={handleCopy}
            className="group/code cursor-pointer rounded-xl border border-border bg-muted px-3 py-2 transition hover:border-primary/40 hover:bg-white"
          >
            <code className="block text-sm font-semibold tracking-normal text-foreground md:text-base">{code.codeText}</code>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="h-9 px-3"
          >
            <Copy className="h-4 w-4" />
            {copied ? '已复制' : '复制'}
          </Button>
        </div>
      </div>
      </Card>
    </motion.div>
  )
}
