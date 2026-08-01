import { useEffect, useState } from 'react'

const DEFAULT_BREAKPOINT = 768

/** Synchronous, SSR/test-safe: is the viewport (or not) a mobile width? */
export function isMobileBreakpoint(breakpoint = DEFAULT_BREAKPOINT): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches
}

/**
 * Reactive viewport check for mobile-width layouts (max-width 768px).
 * Defaults to false in environments without window/matchMedia (SSR, most tests).
 */
export function useIsMobile(breakpoint = DEFAULT_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileBreakpoint(breakpoint))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}
