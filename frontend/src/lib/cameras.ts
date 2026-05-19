import { apiFetch, apiUrl } from '@/lib/api'
import type { Camera, CameraStats } from '@/types/camera'

export function listCameras(token: string) {
  return apiFetch<Camera[]>('/api/cameras', { token })
}

export function getCameraStats(token: string, name: string) {
  return apiFetch<CameraStats>(`/api/cameras/${encodeURIComponent(name)}/stats`, { token })
}

export function cameraSnapshotUrl(name: string, timestamp = Date.now()) {
  return apiUrl(`/api/cameras/${encodeURIComponent(name)}/snapshot?t=${timestamp}`)
}

export function cameraStreamUrl(name: string) {
  return apiUrl(`/api/cameras/${encodeURIComponent(name)}/stream`)
}

export function getCameraDisplayName(camera: Camera) {
  return camera.display_name || camera.name.replace('cam_', '').replace(/_/g, '.')
}
