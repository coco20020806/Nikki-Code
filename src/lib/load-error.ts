import { isRetryableNetworkError } from '@/lib/retry-fetch'

export type LoadErrorKind = 'network' | 'service' | 'unknown'

export type LoadErrorPresentation = {
  kind: LoadErrorKind
  message: string
}

export function presentLoadError(error: unknown): LoadErrorPresentation {
  if (isRetryableNetworkError(error)) {
    return {
      kind: 'network',
      message: '当前网络暂时无法连接数据服务，请稍后重试。',
    }
  }

  if (error instanceof Error) {
    return {
      kind: 'service',
      message: '数据服务暂时不可用，请稍后重试。',
    }
  }

  return {
    kind: 'unknown',
    message: '加载失败，请稍后重试。',
  }
}
