import { useEffect, useRef, useState } from 'react'
import { CameraOff, Flashlight, Maximize2, Pencil } from 'lucide-react'

import { useBreakpoint } from '@/hooks/use-breakpoint'
import { useAuth } from '@/hooks/use-auth'
import { useCameraStream } from '@/hooks/use-camera-stream'
import {
  batteryLevelColor,
  cameraStreamUrl,
  getCameraDisplayName,
  getCameraStats,
  setCameraAlias,
} from '@/lib/cameras'
import type { Camera, CameraStats } from '@/types/camera'
import { PulseDot } from '@/components/ui/pulse-dot'

type OverlayVisibility = 'always' | 'hover'

type CameraCardProps = {
  camera: Camera
  isFlashing: boolean
  isPaused: boolean
  overlayVisibility?: OverlayVisibility
  onOpenFullscreen: (camera: Camera) => void
  onRename: (name: string, displayName: string) => void
  onToggleTorch: (camera: Camera) => void
  torchEnabled: boolean
}

const STATS_INTERVAL_MS = 5000

export function CameraCard({
  camera,
  isFlashing,
  isPaused,
  overlayVisibility = 'always',
  onOpenFullscreen,
  onRename,
  onToggleTorch,
  torchEnabled,
}: CameraCardProps) {
  const { token } = useAuth()
  const breakpoint = useBreakpoint()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [hasSignal, setHasSignal] = useState(true)
  const [stats, setStats] = useState<CameraStats | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const isOnline = camera.online !== false
  const isLive = (camera.video_connections ?? 0) > 0
  const displayName = getCameraDisplayName(camera)
  const { mode, snapshotSrc } = useCameraStream({
    name: camera.name,
    paused: isPaused,
    preferred: isFlashing,
  })
  const src = mode === 'stream' ? cameraStreamUrl(camera.name) : (snapshotSrc ?? '')
  const hideOnIdle = overlayVisibility === 'hover' && breakpoint !== 'mobile'

  useEffect(() => {
    const image = imageRef.current
    return () => { if (image) image.src = '' }
  }, [camera.name])

  useEffect(() => {
    let cancelled = false
    if (!token) return undefined
    const authToken = token
    async function loadStats() {
      try {
        const s = await getCameraStats(authToken, camera.name)
        if (!cancelled) setStats(s)
      } catch {
        if (!cancelled) setStats(null)
      }
    }
    void loadStats()
    const intervalId = window.setInterval(loadStats, STATS_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [camera.name, token])

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditValue(getCameraDisplayName(camera))
    setIsEditing(true)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commitEdit() {
    if (!token) return
    const trimmed = editValue.trim()
    setIsEditing(false)
    if (trimmed === getCameraDisplayName(camera)) return
    try {
      const result = await setCameraAlias(token, camera.name, trimmed)
      onRename(camera.name, result.display_name)
    } catch { /* silently revert */ }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  const fps = stats?.camera_fps ?? null
  const batteryLevel = camera.battery_level ?? null
  const batteryTempC = camera.battery_temp_c ?? null
  const freeSpaceGb = camera.free_space_gb ?? null
  const nightVision = camera.night_vision

  const telemetryParts: React.ReactNode[] = []
  if (fps !== null && fps > 0) telemetryParts.push(<span key="fps">{fps.toFixed(1)} FPS</span>)
  if (batteryLevel !== null) {
    telemetryParts.push(
      <span className="inline-flex items-center gap-1" key="bat">
        <span
          aria-hidden
          className="inline-block h-[7px] w-[34px] border border-white/25 p-px"
        >
          <span
            className="block h-full"
            style={{
              backgroundColor: batteryLevelColor(batteryLevel),
              width: `${Math.max(2, Math.min(100, batteryLevel))}%`,
            }}
          />
        </span>
        BAT {Math.round(batteryLevel)}%{camera.battery_charging ? ' ⚡' : ''}
      </span>,
    )
  }
  if (batteryTempC !== null) telemetryParts.push(<span key="temp">{Math.round(batteryTempC)}°C</span>)
  if (freeSpaceGb !== null) telemetryParts.push(<span key="space">{freeSpaceGb.toFixed(1)} GB</span>)
  if (nightVision !== null && nightVision !== undefined) {
    telemetryParts.push(<span key="ir">IR {nightVision ? 'ON' : 'OFF'}</span>)
  }

  const statusLabel = !isOnline ? 'OFFLINE' : isLive ? 'LIVE' : 'IDLE'
  const showNoSignal = !isOnline || (!hasSignal && !isPaused)
  const overlayVisibilityClass = hideOnIdle
    ? 'opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100'
    : ''

  return (
    <div
      className={`group relative h-full w-full cursor-pointer overflow-hidden bg-[var(--bg-tile)] ${
        isFlashing ? 'z-[1]' : ''
      }`}
      onClick={() => onOpenFullscreen(camera)}
      style={{
        outline: isFlashing ? '2px solid var(--accent)' : undefined,
        outlineOffset: -2,
      }}
    >
      <img
        alt={`${displayName} stream`}
        className="h-full w-full object-cover"
        onError={() => setHasSignal(false)}
        onLoad={() => setHasSignal(true)}
        ref={imageRef}
        src={src}
      />

      {showNoSignal && (
        <div
          className="absolute inset-0 z-10 grid place-items-center"
          style={{ backgroundColor: 'rgba(10,10,10,0.72)' }}
        >
          <div className="flex flex-col items-center gap-2">
            <CameraOff className="h-6 w-6 text-[var(--fg-dim)]" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--fg-muted)]">NO SIGNAL</span>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-2.5 pb-6 pt-2 ${overlayVisibilityClass}`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <PulseDot
            animated={isOnline && isLive}
            size={6}
            speed={2.6}
            tone={!isOnline || !isLive ? 'offline' : 'live'}
          />
          <span className={`font-mono text-[9px] tracking-widest ${isOnline && isLive ? 'text-[var(--status-live)]' : 'text-[var(--fg-muted)]'}`}>
            {statusLabel}
          </span>
          {isEditing ? (
            <input
              autoFocus
              className="w-40 border-b border-white/40 bg-transparent text-[13px] font-extrabold text-[var(--fg)] outline-none"
              onBlur={() => void commitEdit()}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              ref={inputRef}
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
              value={editValue}
            />
          ) : (
            <span
              className="truncate text-[13px] font-extrabold leading-tight text-[var(--fg)]"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
            >
              {displayName}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isFlashing && (
            <span className="bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest text-black">
              EVENT
            </span>
          )}
          {(isPaused || mode === 'snapshot') && isOnline && (
            <span className="bg-black/70 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-[var(--fg-secondary)]">
              SNAPSHOT
            </span>
          )}
          <button
            className={`flex h-8 w-8 items-center justify-center bg-black/70 transition-colors hover:bg-black/90 ${torchEnabled ? 'text-swarm-amber' : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'}`}
            onClick={(e) => { e.stopPropagation(); onToggleTorch(camera) }}
            title="Toggle torch"
          >
            <Flashlight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-8 ${overlayVisibilityClass}`}
      >
        <div className="min-w-0 flex-1 font-mono text-[10px] text-[var(--fg-secondary)]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
          {telemetryParts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 [&>*+*]:before:content-['·'] [&>*+*]:before:mr-1.5 [&>*+*]:before:text-white/50">
              {telemetryParts}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="flex h-8 items-center gap-1.5 bg-black/70 px-2 font-mono text-[10px] tracking-widest text-[var(--fg-secondary)] transition-colors hover:bg-black/90 hover:text-[var(--fg)]"
            onClick={(e) => { e.stopPropagation(); startEdit(e) }}
            title="Rename camera"
          >
            <Pencil className="h-3 w-3" />
            RENAME
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center bg-black/70 text-[var(--fg-secondary)] transition-colors hover:bg-black/90 hover:text-[var(--fg)]"
            onClick={(e) => { e.stopPropagation(); onOpenFullscreen(camera) }}
            title="Open fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
