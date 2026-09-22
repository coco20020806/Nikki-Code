import { describe, expect, it } from 'vitest'
import { presentLoadError } from '@/lib/load-error'

describe('presentLoadError', () => {
  it.each(['Load failed', 'Failed to fetch', 'NetworkError', 'Network request failed'])(
    'classifies "%s" as a network error',
    (message) => {
      expect(presentLoadError(new TypeError(message))).toEqual({
        kind: 'network',
        message: '当前网络暂时无法连接数据服务，请稍后重试。',
      })
    },
  )

  it('does not misclassify a structured service error as a network error', () => {
    expect(presentLoadError(new Error('permission denied for table codes'))).toEqual({
      kind: 'service',
      message: '数据服务暂时不可用，请稍后重试。',
    })
  })

  it('uses a generic message for unknown failures', () => {
    expect(presentLoadError({ reason: 'unknown' })).toEqual({
      kind: 'unknown',
      message: '加载失败，请稍后重试。',
    })
  })
})
