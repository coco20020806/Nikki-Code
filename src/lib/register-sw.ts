/** 注册根路径下的 Service Worker（对应 public/sw.js） */
export function registerNikkiServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const base = import.meta.env.BASE_URL || '/'
  const swPath = `${base.replace(/\/?$/, '/') }sw.js`

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(swPath, { scope: base })
      .catch((err: unknown) => {
        console.warn('[NikkiCode] Service Worker 注册失败:', err)
      })
  })
}
