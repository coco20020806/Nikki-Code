import { useEffect, useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'

import { ensureMiniSession, listClaimedCodeIds, listCodes, setCodeClaimed } from '@/lib/api'
import type { NikkiCode } from '@/types/code'
import './index.scss'

const TABS = ['未领取', '无限暖暖', '闪耀暖暖'] as const
const CLAIMED_CACHE_KEY = 'nikki_claimed_cache_v1'

const SERVER_LABELS: Record<string, string> = {
  SN_CN: '国服',
  SN_TW: '台服',
  IN_CN: '国服',
  IN_GL: '国际服',
}

function expiryLabel(expiryAt?: string): string {
  if (!expiryAt) return '长期有效'
  const expiry = Date.parse(expiryAt)
  if (Number.isNaN(expiry)) return '有效期未知'
  const hours = Math.ceil((expiry - Date.now()) / 3_600_000)
  if (hours <= 0) return '已过期'
  if (hours < 24) return `${hours} 小时后过期`
  return `${Math.ceil(hours / 24)} 天后过期`
}

export default function IndexPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('未领取')
  const [codes, setCodes] = useState<NikkiCode[]>([])
  const [claimedIds, setClaimedIds] = useState<Set<number>>(
    () => new Set(Taro.getStorageSync<number[]>(CLAIMED_CACHE_KEY) || []),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const persistClaimed = (next: Set<number>) => {
    setClaimedIds(next)
    Taro.setStorageSync(CLAIMED_CACHE_KEY, [...next])
  }

  const refresh = async () => {
    setError('')
    try {
      await ensureMiniSession()
      const [nextCodes, cloudClaims] = await Promise.all([listCodes(), listClaimedCodeIds()])
      const localClaims = new Set(Taro.getStorageSync<number[]>(CLAIMED_CACHE_KEY) || [])
      const cloudClaimSet = new Set(cloudClaims)
      const pendingUploads = [...localClaims].filter((codeId) => !cloudClaimSet.has(codeId))
      await Promise.allSettled(pendingUploads.map((codeId) => setCodeClaimed(codeId, true)))
      setCodes(nextCodes)
      persistClaimed(new Set([...cloudClaims, ...localClaims]))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  usePullDownRefresh(() => {
    void refresh().finally(() => Taro.stopPullDownRefresh())
  })

  const visibleCodes = useMemo(() => {
    const now = Date.now()
    return codes
      .filter((code) => !code.expiryAt || Date.parse(code.expiryAt) > now)
      .filter((code) => (activeTab === '未领取' ? !claimedIds.has(code.id) : code.gameName === activeTab))
      .sort((a, b) => Number(b.isHighValue) - Number(a.isHighValue))
  }, [activeTab, claimedIds, codes])

  const toggleClaimed = async (codeId: number, claimed: boolean) => {
    const previous = new Set(claimedIds)
    const next = new Set(previous)
    if (claimed) next.add(codeId)
    else next.delete(codeId)
    persistClaimed(next)
    try {
      await setCodeClaimed(codeId, claimed)
    } catch (err) {
      persistClaimed(previous)
      await Taro.showToast({ title: err instanceof Error ? err.message : '同步失败', icon: 'none' })
    }
  }

  const copyCode = async (code: NikkiCode) => {
    await Taro.setClipboardData({ data: code.codeText })
    if (!claimedIds.has(code.id)) await toggleClaimed(code.id, true)
  }

  return (
    <View className='page'>
      <View className='hero'>
        <Text className='eyebrow'>NIKKI GIFT HUB</Text>
        <Text className='title'>今天也别漏掉福利 ✨</Text>
        <Text className='subtitle'>登录状态会自动同步，换手机也能记住哪些兑换码已经领过。</Text>
      </View>

      <ScrollView className='tabs' scrollX enhanced showScrollbar={false}>
        <View className='tabs-inner'>
          {TABS.map((tab) => (
            <Button
              key={tab}
              className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </View>
      </ScrollView>

      {loading ? <View className='state-card'>正在同步兑换码…</View> : null}
      {!loading && error ? (
        <View className='state-card state-error'>
          <Text>{error}</Text>
          <Button className='retry-button' onClick={() => void refresh()}>重新加载</Button>
        </View>
      ) : null}
      {!loading && !error && visibleCodes.length === 0 ? (
        <View className='state-card'>暂时没有待领取的兑换码，真棒！</View>
      ) : null}

      <View className='code-list'>
        {visibleCodes.map((code) => {
          const claimed = claimedIds.has(code.id)
          return (
            <View key={code.id} className={`code-card ${claimed ? 'code-card-claimed' : ''}`}>
              <View className='badges'>
                <Text className={`game-badge ${code.gameName === '无限暖暖' ? 'game-infinity' : 'game-shining'}`}>
                  {code.gameName}
                </Text>
                {code.server ? <Text className='server-badge'>{SERVER_LABELS[code.server] || code.server}</Text> : null}
                {code.isHighValue ? <Text className='value-badge'>高价值</Text> : null}
              </View>

              <View className='reward'>
                {code.diamondReward ? <Text className='diamond'>💎 {code.diamondReward} 钻石</Text> : null}
                <Text className='other-reward'>{code.otherReward || code.rewardDesc || '兑换奖励'}</Text>
              </View>

              <View className='meta'>
                <Text>{expiryLabel(code.expiryAt)}</Text>
                {code.source ? <Text>来自 {code.source}</Text> : null}
              </View>

              <View className='code-row'>
                <Text className='code-text'>{code.codeText}</Text>
                <Button className='copy-button' onClick={() => void copyCode(code)}>复制</Button>
              </View>

              {claimed ? (
                <Button className='undo-button' onClick={() => void toggleClaimed(code.id, false)}>取消已兑换</Button>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

