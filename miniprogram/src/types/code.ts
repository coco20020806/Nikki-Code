export type NikkiCode = {
  id: number
  gameName: '无限暖暖' | '闪耀暖暖' | string
  server?: string
  codeText: string
  diamondReward?: string
  otherReward?: string
  rewardDesc?: string
  expiryAt?: string
  isHighValue: boolean
  source?: string
}

