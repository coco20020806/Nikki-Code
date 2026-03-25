export interface Code {
  id: number
  gameName: string
  codeText: string
  // 低价值/高价值奖励拆分：前者为“钻石奖励”，后者为“其他奖励”
  diamondReward?: string
  otherReward?: string
  // 兼容旧字段（如果数据库还没做拆分迁移，可先用该字段）
  rewardDesc?: string
  expiryAt?: string
  isHighValue: boolean
  isInvalid?: boolean
  source?: string
}
