import { apiFetch, apiUrl } from '@/lib/api'

export type FrigateEvent = {
  id: string
  camera: string
  label: string
  score: number
  start_time: number
  end_time: number | null
  has_snapshot: boolean
  has_clip: boolean
}

export type FireEvent = {
  id: string
  camera: string
  label: string
  score: number
  timestamp: number
}


export type EventFilters = {
  camera?: string
  label?: string
  after?: number
  before?: number
  limit?: number
}

export function getEvents(token: string, filters: EventFilters = {}) {
  const params = new URLSearchParams()
  if (filters.camera) params.set('camera', filters.camera)
  if (filters.label) params.set('label', filters.label)
  if (filters.after) params.set('after', String(filters.after))
  if (filters.before) params.set('before', String(filters.before))
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return apiFetch<FrigateEvent[]>(`/api/events${qs ? `?${qs}` : ''}`, { token })
}

export function getFireEvents(token: string, filters: EventFilters = {}) {
  const params = new URLSearchParams()
  if (filters.camera) params.set('camera', filters.camera)
  if (filters.label) params.set('label', filters.label)
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return apiFetch<FireEvent[]>(`/api/fire-events${qs ? `?${qs}` : ''}`, { token })
}


export function getRecordingEvents(token: string, filters: EventFilters = {}) {
  const params = new URLSearchParams()
  if (filters.camera) params.set('camera', filters.camera)
  if (filters.label) params.set('label', filters.label)
  if (filters.after) params.set('after', String(filters.after))
  if (filters.before) params.set('before', String(filters.before))
  if (filters.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return apiFetch<FrigateEvent[]>(`/api/recordings/events${qs ? `?${qs}` : ''}`, { token })
}

export function eventThumbnailUrl(eventId: string) {
  return apiUrl(`/api/events/${encodeURIComponent(eventId)}/thumbnail`)
}

export function recordingClipUrl(eventId: string) {
  return apiUrl(`/api/recordings/${encodeURIComponent(eventId)}/clip`)
}

export function formatEventTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('hu-HU', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function formatDuration(start: number, end: number | null): string {
  if (!end) return '—'
  const s = Math.round(end - start)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
