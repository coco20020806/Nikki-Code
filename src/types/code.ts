export interface Code {
  id: number
  gameName: string
  /** 区服标识：SN_CN / SN_TW / IN_CN / IN_GL */
  server?: string
  codeText: string
  // 低价值/高价值奖励拆分：前者为“钻石奖励”，后者为“其他奖励”
  diamondReward?: string
  otherReward?: string
  // 兼容旧字段（如果数据库还没做拆分迁移，可先用该字段）
  rewardDesc?: string
  expiryAt?: string
  /** 巡逻提醒范围上限（小时）：24 / 72 / 168；未设置视为 168，与用户推送偏好取较小值 */
  reminderHours?: number | null
  isHighValue: boolean
  isInvalid?: boolean
  source?: string
}
