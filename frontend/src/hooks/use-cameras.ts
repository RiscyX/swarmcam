/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'

import { useAuth } from '@/hooks/use-auth'
import { listCameras } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

export function useCameras() {
  const { isAuthenticated, token } = useAuth()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!token) {
      setCameras([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      setCameras(await listCameras(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kamerák betöltése sikertelen')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return

    void reload()
    // reload intentionally depends on current token/auth state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token])

  return { cameras: isAuthenticated ? cameras : [], error, isLoading, reload, setCameras }
}
