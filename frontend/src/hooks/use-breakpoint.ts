import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const QUERIES: Array<{ breakpoint: Breakpoint; query: string }> = [
  { breakpoint: 'desktop', query: '(min-width: 1024px)' },
  { breakpoint: 'tablet', query: '(min-width: 768px) and (max-width: 1023.98px)' },
  { breakpoint: 'mobile', query: '(max-width: 767.98px)' },
]

function resolveBreakpoint(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  for (const { breakpoint, query } of QUERIES) {
    if (window.matchMedia(query).matches) return breakpoint
  }
  return 'mobile'
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(resolveBreakpoint)

  useEffect(() => {
    const lists = QUERIES.map(({ query }) => window.matchMedia(query))
    const handleChange = () => setBreakpoint(resolveBreakpoint())
    for (const list of lists) list.addEventListener('change', handleChange)
    return () => {
      for (const list of lists) list.removeEventListener('change', handleChange)
    }
  }, [])

  return breakpoint
}
