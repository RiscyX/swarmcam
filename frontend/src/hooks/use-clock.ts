import { useEffect, useState } from 'react'

export function useClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('hu-HU', { hour12: false }))

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(new Date().toLocaleTimeString('hu-HU', { hour12: false }))
    }, 1000)

    return () => window.clearInterval(id)
  }, [])

  return time
}
