import { apiFetch, apiUrl } from '@/lib/api'
import type { Camera, CameraStats } from '@/types/camera'

export function listCameras(token: string) {
  return apiFetch<Camera[]>('/api/cameras', { token })
}

export function getCameraStats(token: string, name: string) {
  return apiFetch<CameraStats>(`/api/cameras/${encodeURIComponent(name)}/stats`, { token })
}

export function setCameraTorch(token: string, name: string, enabled: boolean) {
  return apiFetch<{ ok: boolean }>(`/api/cameras/${encodeURIComponent(name)}/torch`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

export function cameraSnapshotUrl(name: string, timestamp = Date.now()) {
  return apiUrl(`/api/cameras/${encodeURIComponent(name)}/snapshot?t=${timestamp}`)
}

export function cameraStreamUrl(name: string) {
  return apiUrl(`/api/cameras/${encodeURIComponent(name)}/stream`)
}

export type CameraSettingsPayload = {
  orientation?: string | null
  quality?: number | null
  video_size?: string | null
  night_vision?: string | null
  video_fps?: number | null
  mirror_flip?: string | null
  ffc?: string | null
}

export function getCameraSettings(token: string, name: string) {
  return apiFetch<CameraSettingsPayload>(`/api/cameras/${encodeURIComponent(name)}/settings`, { token })
}

export function saveCameraSettings(token: string, name: string, settings: CameraSettingsPayload) {
  return apiFetch<{ ok: boolean; applied: string[] }>(`/api/cameras/${encodeURIComponent(name)}/settings`, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export function setCameraAlias(token: string, name: string, alias: string) {
  return apiFetch<{ ok: boolean; display_name: string }>(`/api/cameras/${encodeURIComponent(name)}/alias`, {
    method: 'PATCH',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias }),
  })
}

export function getCameraDisplayName(camera: Camera) {
  return camera.display_name || camera.name.replace('cam_', '').replace(/_/g, '.')
}
