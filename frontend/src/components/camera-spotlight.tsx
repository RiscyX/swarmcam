import { useEffect, useState } from 'react'

import { CameraCard } from '@/components/camera-card'
import { PulseDot } from '@/components/ui/pulse-dot'
import { useAuth } from '@/hooks/use-auth'
import { useBreakpoint } from '@/hooks/use-breakpoint'
import { useCameraStream } from '@/hooks/use-camera-stream'
import { cameraStreamUrl, getCameraDisplayName, getCameraStats } from '@/lib/cameras'
import type { Camera, CameraStats } from '@/types/camera'

const STATS_INTERVAL_MS = 5000
const STRIP_HEIGHT = { desktop: 124, mobile: 82 }
const TILE_WIDTH = { desktop: 190, mobile: 132 }

type FilmstripTileProps = {
  camera: Camera
  isFlashing: boolean
  isPaused: boolean
  onSelect: (name: string) => void
  width: number
}

function FilmstripTile({ camera, isFlashing, isPaused, onSelect, width }: FilmstripTileProps) {
  const { token } = useAuth()
  const [stats, setStats] = useState<CameraStats | null>(null)
  const { mode, snapshotSrc } = useCameraStream({ name: camera.name, paused: isPaused })

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

  const isOnline = camera.online !== false
  const fps = stats?.camera_fps ?? null
  const src = mode === 'stream' ? cameraStreamUrl(camera.name) : (snapshotSrc ?? '')

  return (
    <button
      className="relative h-full cursor-pointer overflow-hidden bg-[var(--bg-tile)] text-left hover:outline hover:outline-2 hover:outline-[var(--accent)]"
      onClick={() => onSelect(camera.name)}
      style={{
        flex: `0 0 ${width}px`,
        outline: isFlashing ? '2px solid var(--accent)' : undefined,
        outlineOffset: -2,
      }}
      title={`Focus: ${getCameraDisplayName(camera)}`}
      type="button"
    >
      <img alt={`${getCameraDisplayName(camera)} thumbnail`} className="h-full w-full object-cover" src={src} />

      <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/80 to-transparent px-1.5 pb-4 pt-1">
        {!isOnline ? <PulseDot animated={false} size={5} speed={2.6} tone="offline" /> : null}
        <span
          className="min-w-0 truncate font-mono text-[9px] tracking-wider text-[var(--on-video-secondary)]"
          style={{ textShadow: '0 1px 4px #000' }}
        >
          {getCameraDisplayName(camera)}
        </span>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-4 font-mono text-[9px] text-[var(--on-video-muted)]"
        style={{ textShadow: '0 1px 4px #000' }}
      >
        <span>{fps !== null && fps > 0 ? `${fps.toFixed(1)} FPS` : '—'}</span>
        <span>{mode === 'stream' ? 'MJPEG' : 'SNAPSHOT'}</span>
      </div>
    </button>
  )
}

type CameraSpotlightProps = {
  cameras: Camera[]
  eventCamera: string | null
  focusId: string | null
  isPaused: boolean
  onFocusChange: (name: string) => void
  onOpenFullscreen: (camera: Camera) => void
  onRenameCamera: (name: string, displayName: string) => void
  onToggleTorch: (camera: Camera) => void
  torchStates: Record<string, boolean>
}

export function CameraSpotlight({
  cameras,
  eventCamera,
  focusId,
  isPaused,
  onFocusChange,
  onOpenFullscreen,
  onRenameCamera,
  onToggleTorch,
  torchStates,
}: CameraSpotlightProps) {
  const isMobile = useBreakpoint() === 'mobile'
  // Ha a fókuszált kamera eltűnt a listából (törlés, újrascan), az elsőre esünk vissza.
  const hero = cameras.find((camera) => camera.name === focusId) ?? cameras[0]
  const strip = cameras.filter((camera) => camera.name !== hero.name)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* key: promotáláskor a CameraCard cleanupja kinullázná az <img> src-jét — remount kell, mint a gridben */}
      <div className={`bg-[var(--bg-tile)] ${isMobile ? 'aspect-video w-full shrink-0' : 'min-h-0 flex-1'}`}>
        <CameraCard
          camera={hero}
          isFlashing={eventCamera === hero.name}
          isPaused={isPaused}
          key={hero.name}
          onOpenFullscreen={onOpenFullscreen}
          onRename={onRenameCamera}
          onToggleTorch={onToggleTorch}
          torchEnabled={Boolean(torchStates[hero.name])}
          variant="hero"
        />
      </div>

      {strip.length > 0 ? (
        <div
          className="flex shrink-0 gap-[2px] overflow-x-auto border-t-2 border-[var(--border)] bg-[var(--border)]"
          style={{ height: isMobile ? STRIP_HEIGHT.mobile : STRIP_HEIGHT.desktop }}
        >
          {strip.map((camera) => (
            <FilmstripTile
              camera={camera}
              isFlashing={eventCamera === camera.name}
              isPaused={isPaused}
              key={camera.name}
              onSelect={onFocusChange}
              width={isMobile ? TILE_WIDTH.mobile : TILE_WIDTH.desktop}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
