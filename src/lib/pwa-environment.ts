/** 是否为已安装的 PWA / 主屏幕全屏模式 */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  } catch {
    /* ignore */
  }
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  return false
}

export type PwaInstallPlatform = 'ios' | 'android' | 'desktop'

/** 粗略区分 iOS / Android / 桌面（含平板桌面浏览器归为 desktop） */
export function detectInstallPlatform(): PwaInstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  const maxTouch = 'maxTouchPoints' in navigator ? Number(navigator.maxTouchPoints) : 0
  const isIpadOs =
    navigator.platform === 'MacIntel' && maxTouch > 1 && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  if (/iPhone|iPod/.test(ua) || (/iPad/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) || isIpadOs) {
    return 'ios'
  }
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}
