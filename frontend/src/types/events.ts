export type CameraSocketStatus = 'idle' | 'connected' | 'reconnecting'

export type FrigateLiveEvent = {
  type: 'frigate_event'
  camera?: string | null
  label?: string | null
  score?: number | null
  id?: string | null
  receivedAt: number
}

export type CameraSocketMessage =
  | { type: 'status'; cameras: unknown[] }
  | { type: 'alert'; message?: string }
  | { type: 'frigate_event'; camera?: string | null; label?: string | null; score?: number | null; id?: string | null }
  | { type: 'ping' }
