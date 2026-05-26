import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Gift, Gem, ShieldAlert, Trash2 } from 'lucide-react'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { Layout } from '@/components/layout'
import type { Code } from '@/types/code'
import { Badge } from '@/components/ui/badge'
import { deleteCode, listCodes } from '@/lib/codes-api'
import { Input } from '@/components/ui/input'
import { APP_VERSION } from '@/lib/app-version'

export default function Admin() {
  const [codes, setCodes] = useState<Code[]>([])
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)

  const refresh = () => {
    setError('')
    setWorking(true)
    listCodes(undefined)
      .then(setCodes)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => setWorking(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-display font-extrabold text-foreground">
          <ShieldAlert className="h-8 w-8 text-primary" />
          兑换码管理
        </h1>
        <p className="mt-2 text-muted-foreground">
          完整录入入口：<a className="underline" href="/admin.html">/admin.html</a>（v{APP_VERSION}）。
          此页面主要用于删除已存在的兑换码（需要管理员密码）。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <CollapsibleSection title="有效与历史兑换码" defaultOpen>
          <div className="grid gap-3">
            <Input
              type="password"
              placeholder="管理员密码（用于删除）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              {working ? '加载中...' : '请在下方点击「删除」。'}
            </div>
            {error ? <p className="text-sm text-destructive">加载失败：{error}</p> : null}
          </div>
          <div className="mt-4 space-y-4">
            {codes.map((code) => {
              const gameBadgeClass =
                code.gameName === '无限暖暖'
                  ? 'bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200'
                  : code.gameName === '闪耀暖暖'
                    ? 'bg-sky-100 text-sky-700 border border-sky-200'
                    : ''
              return (
                <div
                  key={code.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-card-border bg-white/95 p-4 transition-colors hover:border-primary/30 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge className={`tracking-wide uppercase ${gameBadgeClass}`}>{code.gameName}</Badge>
                      {code.isHighValue ? <Badge variant="accent">高价值</Badge> : null}
                    </div>
                    <div className="font-mono text-lg font-bold text-foreground">{code.codeText}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {code.diamondReward ? (
                        <span className="inline-flex items-center gap-2">
                          <Gem className="h-4 w-4 text-primary" /> {code.diamondReward} 钻石
                        </span>
                      ) : code.otherReward ? (
                        <span className="inline-flex items-center gap-2">
                          <Gift className="h-4 w-4 text-primary" /> {code.otherReward}
                        </span>
                      ) : code.rewardDesc ? (
                        <span className="inline-flex items-center gap-2">
                          <Gift className="h-4 w-4 text-primary" /> {code.rewardDesc}
                        </span>
                      ) : (
                        '无奖励'
                      )}
                    </div>
                    <div className="mt-2 text-xs font-medium text-muted-foreground">
                      过期时间: {code.expiryAt ? format(new Date(code.expiryAt), 'PPp') : '永久'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">ID: {code.id}</span>
                    <button
                      type="button"
                      className="rounded-xl p-3 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="删除兑换码（标记无效）"
                      onClick={async () => {
                        if (!password.trim()) {
                          setError('请输入管理员密码后再删除')
                          return
                        }
                        if (!confirm('确认删除该兑换码吗？')) return
                        setError('')
                        try {
                          setWorking(true)
                          await deleteCode(code.id, password)
                          await refresh()
                        } catch (e) {
                          setError(e instanceof Error ? e.message : '删除失败')
                        } finally {
                          setWorking(false)
                        }
                      }}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsibleSection>
      </div>
    </Layout>
  )
}
