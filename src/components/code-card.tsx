import { useState } from 'react'
import { motion } from 'framer-motion'
import { addHours, formatDistanceToNow, isBefore, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CheckCircle2, Clock, Copy, ExternalLink, Gift, Gem, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { Code } from '@/types/code'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface CodeCardProps {
  code: Code
  isClaimed: boolean
  onClaim: (id: number) => void
  onUnclaim: (id: number) => void
}

export function CodeCard({ code, isClaimed, onClaim, onUnclaim }: CodeCardProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const expiryDate = code.expiryAt ? parseISO(code.expiryAt) : null
  const isExpired = expiryDate ? isBefore(expiryDate, new Date()) : false
  const isExpiringSoon = expiryDate ? isBefore(expiryDate, addHours(new Date(), 24)) && !isExpired : false

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.codeText)
      setCopied(true)
      if (!isClaimed) onClaim(code.id)
      toast({ title: '✨ 已复制！', description: '兑换码已复制到剪贴板。' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: '哎呀！', description: '复制到剪贴板失败。', variant: 'destructive' })
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className={`relative transition-all duration-300 ${
        isClaimed ? 'bg-white/50 opacity-75 shadow-sm grayscale-[0.3]' : 'glass-card shadow-lg hover:shadow-xl hover:shadow-primary/20'
      } ${code.isHighValue && !isClaimed ? 'ring-accent/50 shadow-accent/10 ring-2' : 'border-border/50'}`}
    >
      {code.isHighValue && !isClaimed ? (
        <div className="pointer-events-none absolute top-0 right-0 -mt-10 -mr-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
      ) : null}

      <Card className="rounded-3xl border-none bg-transparent shadow-none">
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="tracking-wider uppercase">{code.gameName}</Badge>
            {code.isHighValue ? (
              <Badge variant="accent" className="gap-1">
                <Sparkles className="h-3 w-3" />
                限定
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {expiryDate ? (
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  isExpired
                    ? 'bg-black/5 text-muted-foreground'
                    : isExpiringSoon
                      ? 'animate-pulse bg-destructive/10 text-destructive'
                      : 'bg-secondary/20 text-secondary-foreground'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {isExpired ? '已过期' : formatDistanceToNow(expiryDate, { addSuffix: true, locale: zhCN })}
              </div>
            ) : null}
          </div>
        </div>

        <div
          onClick={handleCopy}
          className="group/code relative mb-4 flex cursor-pointer items-center justify-center rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:border-primary/30 hover:bg-white hover:shadow-inner"
        >
          <code className="font-display text-3xl font-black tracking-widest text-foreground">{code.codeText}</code>
          <div className="absolute right-4 text-muted-foreground transition-colors group-hover/code:text-primary">
            {copied ? <CheckCircle2 className="h-6 w-6 text-green-500" /> : <Copy className="h-6 w-6" />}
          </div>
        </div>

        {isClaimed ? (
          <div className="mb-3 flex items-center gap-2">
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
          </div>
        ) : null}

        <div className="space-y-2">
          {code.diamondReward ? (
            <div className="flex gap-2 text-sm font-medium text-foreground">
              <Gem className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>{code.diamondReward} 钻石</p>
            </div>
          ) : null}
          {code.otherReward ? (
            <div className="flex gap-2 text-sm font-medium text-foreground">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>{code.otherReward}</p>
            </div>
          ) : null}
          {!code.diamondReward && !code.otherReward && code.rewardDesc ? (
            <div className="flex gap-2 text-sm font-medium text-foreground">
              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>{code.rewardDesc}</p>
            </div>
          ) : null}
          {code.source ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <p>来自 {code.source}</p>
            </div>
          ) : null}
        </div>
      </div>
      </Card>
    </motion.div>
  )
}
