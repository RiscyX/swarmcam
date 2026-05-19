import { apiFetch } from '@/lib/api'

export type DecoderType = 'cpu' | 'nvidia' | 'intel' | 'coral'
export type RtspTransport = 'tcp' | 'udp'

export type ConfigSettings = {
  decoder: DecoderType
  detection_fps: number
  detection_width: number
  detection_height: number
  rtsp_transport: RtspTransport
  record_motion_days: number
  record_event_days: number
  objects: string[]
}

export type SystemInfo = {
  nvidia_gpu: boolean
  nvidia_docker: boolean
  intel_gpu: boolean
}

export type SaveConfigResponse = {
  ok: boolean
  decoder_changed: boolean
  frigate_restarted: boolean
}

export function getConfig(token: string) {
  return apiFetch<ConfigSettings>('/api/config', { token })
}

export function saveConfig(token: string, settings: ConfigSettings) {
  return apiFetch<SaveConfigResponse>('/api/config', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export function getSystemInfo(token: string) {
  return apiFetch<SystemInfo>('/api/system', { token })
}
