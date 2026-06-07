import { apiFetch, apiUrl } from '@/lib/api'
import type { Camera } from '@/types/camera'

export type NetworkInfo = {
  iface: string
  ip: string
  subnet: string
}

export type DiscoverRequest = {
  subnet?: string
  port: number
  timeout: number
  update_frigate: boolean
}

export function getNetworks(token: string) {
  return apiFetch<NetworkInfo[]>('/api/networks', { token })
}

export function resetCameras(token: string) {
  return apiFetch<{ reset: boolean }>('/api/cameras/reset', { method: 'POST', token })
}

export function clearRecordings(token: string) {
  return apiFetch<{ cleared_mb: number }>('/api/recordings', { method: 'DELETE', token })
}

export function discoverStreamUrl() {
  return apiUrl('/api/discover/stream')
}

export function discoverXmStreamUrl() {
  return apiUrl('/api/discover/xm/stream')
}

export type XMDiscoverRequest = {
  subnet?: string
  timeout: number
  update_frigate: boolean
}

export type DiscoveryStreamEvent =
  | { type: 'progress'; message: string }
  | { type: 'result'; cameras: Camera[] }
  | { type: 'done' }
