export type Camera = {
  ip: string
  port: number
  name: string
  display_name?: string
  stream_url?: string
  http_url?: string
  battery_level?: number | null
  wifi_strength?: number | null
  online?: boolean
}

export type CameraStats = {
  camera_fps: number
  detection_fps: number
  skipped_fps: number
  process_fps: number
}

export type CameraLayout = 'auto' | '2x2' | '3x3' | 'spotlight'
