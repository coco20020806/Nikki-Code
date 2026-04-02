import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { detectInstallPlatform, isStandaloneDisplayMode, type PwaInstallPlatform } from '@/lib/pwa-environment'

const DISMISS_KEY = 'nikki_smart_install_banner_dismissed_v1'

function bannerCopy(platform: PwaInstallPlatform): string {
  if (platform === 'ios') {
    return '💡 开启红点提醒： 点击浏览器下方【分享】图标 -> 选择【添加到主屏幕】即可安装。'
  }
  if (platform === 'android') {
    return '💡 开启红点提醒： 点击工具栏【三个点】 -> 选择【安装应用】或【添加到主屏幕】。'
  }
  return '建议使用手机浏览器打开并安装到桌面以获得最佳体验。'
}

type PwaInstallBannerProps = {
  /** 横幅实际展示时通知父级，用于给主内容加底部留白 */
  onVisibleChange?: (visible: boolean) => void
}

export function PwaInstallBanner({ onVisibleChange }: PwaInstallBannerProps) {
  const [standalone, setStandalone] = useState(() =>
    typeof window !== 'undefined' ? isStandaloneDisplayMode() : true,
  )
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const platform = useMemo(() => detectInstallPlatform(), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(display-mode: standalone)')
    const mqFs = window.matchMedia('(display-mode: fullscreen)')
    const sync = () => {
      setStandalone(isStandaloneDisplayMode())
    }
    sync()
    mq.addEventListener('change', sync)
    mqFs.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      mqFs.removeEventListener('change', sync)
    }
  }, [])

  const visible = !standalone && !dismissed

  useEffect(() => {
    onVisibleChange?.(visible)
    return () => {
      onVisibleChange?.(false)
    }
  }, [visible, onVisibleChange])

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-[45] border-t border-white/40 shadow-[0_-8px_32px_rgba(236,72,153,0.18)] backdrop-blur-xl"
      style={{
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        paddingTop: '0.65rem',
        background:
          'linear-gradient(135deg, rgba(253, 242, 248, 0.92) 0%, rgba(252, 231, 243, 0.94) 45%, rgba(254, 215, 226, 0.9) 100%)',
      }}
      role="region"
      aria-label="安装到主屏幕提示"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-3 sm:px-6">
        <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-rose-950/90 sm:text-sm sm:leading-snug">
          {bannerCopy(platform)}
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="关闭提示"
          className="mt-0.5 shrink-0 rounded-full p-1 text-rose-800/70 transition-colors hover:bg-rose-500/15 hover:text-rose-950"
        >
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
