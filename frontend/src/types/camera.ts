export type Camera = {
  ip: string
  port: number
  name: string
  display_name?: string
  rtsp_url?: string
  http_url?: string
  battery_level?: number | null
  battery_charging?: boolean | null
  battery_temp_c?: number | null
  free_space_gb?: number | null
  video_connections?: number | null
  night_vision?: boolean | null
  quality?: number | null
  online?: boolean
}

export type CameraStats = {
  camera_fps: number
  detection_fps: number
  skipped_fps: number
  process_fps: number
}

export type CameraLayout = 'auto' | '1x1' | '2x2' | '1plus3'
