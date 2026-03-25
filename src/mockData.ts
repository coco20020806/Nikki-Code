import type { Code } from '@/types/code'

export const initialCodes: Code[] = [
  {
    id: 1,
    gameName: '无限暖暖',
    codeText: 'NIKKI2026',
    diamondReward: '100',
    otherReward: '20 体力',
    expiryAt: '2026-12-31T23:59:59.000Z',
    isHighValue: true,
    source: '官方微博',
  },
  {
    id: 2,
    gameName: '闪耀暖暖',
    codeText: 'SHININGGIFT',
    otherReward: '金币 x50000',
    expiryAt: '2026-08-01T12:00:00.000Z',
    isHighValue: false,
    source: 'TapTap 社区',
  },
  {
    id: 3,
    gameName: '无限暖暖',
    codeText: 'NIKKISTAR',
    otherReward: '限定拍照贴纸',
    isHighValue: false,
    source: 'Bilibili 官方号',
  },
]
