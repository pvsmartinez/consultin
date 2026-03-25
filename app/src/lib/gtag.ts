export function gtagEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    ;(window as any).gtag('event', name, params)
  }
}
