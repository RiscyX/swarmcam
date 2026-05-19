import { useEffect, useState } from 'react'

import { wsUrl } from '@/lib/api'
import type { Camera } from '@/types/camera'
import type { CameraSocketMessage, CameraSocketStatus, FrigateLiveEvent } from '@/types/events'

type UseCameraSocketOptions = {
  enabled: boolean
  onAlert: (message: string) => void
  onEvent: (event: FrigateLiveEvent) => void
  onStatus: (cameras: Camera[]) => void
}

function isCameraList(value: unknown): value is Camera[] {
  return Array.isArray(value)
}

export function useCameraSocket({ enabled, onAlert, onEvent, onStatus }: UseCameraSocketOptions) {
  const [status, setStatus] = useState<CameraSocketStatus>('idle')

  useEffect(() => {
    if (!enabled) return undefined

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let closedByCleanup = false

    function connect() {
      socket = new WebSocket(wsUrl('/ws/cameras'))

      socket.onopen = () => setStatus('connected')
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as CameraSocketMessage
        if (message.type === 'ping') return
        if (message.type === 'status' && isCameraList(message.cameras)) {
          onStatus(message.cameras)
          return
        }
        if (message.type === 'alert' && message.message) {
          onAlert(message.message)
          return
        }
        if (message.type === 'frigate_event') {
          onEvent({ ...message, receivedAt: Date.now() })
        }
      }
      socket.onclose = () => {
        if (closedByCleanup) return
        setStatus('reconnecting')
        reconnectTimer = window.setTimeout(connect, 5000)
      }
      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closedByCleanup = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [enabled, onAlert, onEvent, onStatus])

  return enabled ? status : 'idle'
}
