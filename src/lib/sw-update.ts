/**
 * 检测是否有新版本 Service Worker 在 waiting（需 sw.js 在「已有旧版」时不自动 skipWaiting）。
 */
export async function checkServiceWorkerUpdateAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    await reg.update()
    await new Promise((r) => setTimeout(r, 400))
    return Boolean(reg.waiting)
  } catch {
    return false
  }
}

/** 用户确认后激活 waiting 中的 SW 并刷新页面 */
export function activateWaitingServiceWorkerAndReload(): void {
  if (!('serviceWorker' in navigator)) {
    window.location.reload()
    return
  }
  void navigator.serviceWorker.getRegistration().then((reg) => {
    const waiting = reg?.waiting
    if (!waiting) {
      window.location.reload()
      return
    }
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    waiting.postMessage({ type: 'SKIP_WAITING' })
    window.setTimeout(() => window.location.reload(), 2000)
  })
}
