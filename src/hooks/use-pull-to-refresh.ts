import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 56
const MAX_PULL_VISUAL = 84

function rubberBand(dy: number): number {
  return Math.min(Math.pow(dy, 0.85) * 0.45, MAX_PULL_VISUAL)
}

type Options = {
  onRefresh: () => Promise<void>
  enabled?: boolean
}

/**
 * 在容器上监听触摸下拉；仅在窗口接近顶部时生效。需在可滚动内容上使用 ref 挂载。
 */
export function usePullToRefresh({ onRefresh, enabled = true }: Options) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const refreshingRef = useRef(false)
  const pullDistanceRef = useRef(0)
  const setPull = useCallback((v: number) => {
    pullDistanceRef.current = v
    setPullDistance(v)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !enabled) return

    let startY = 0
    let tracking = false

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (window.scrollY > 8) return
      tracking = true
      startY = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking || refreshingRef.current) return
      if (window.scrollY > 8) {
        tracking = false
        setPull(0)
        return
      }
      const dy = e.touches[0].clientY - startY
      if (dy > 4) {
        e.preventDefault()
        setPull(rubberBand(dy))
      } else if (dy < -12) {
        tracking = false
        setPull(0)
      }
    }

    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (refreshingRef.current) return

      const dist = pullDistanceRef.current
      if (dist >= PULL_THRESHOLD) {
        void (async () => {
          refreshingRef.current = true
          setRefreshing(true)
          setPull(44)
          try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(10)
            }
            await onRefreshRef.current()
          } finally {
            refreshingRef.current = false
            setRefreshing(false)
            setPull(0)
          }
        })()
      } else {
        setPull(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, setPull])

  const showSpinner = refreshing || pullDistance > 12
  const indicatorHeight = refreshing ? 44 : pullDistance

  return {
    containerRef,
    pullDistance,
    refreshing,
    showSpinner,
    indicatorHeight,
  }
}
