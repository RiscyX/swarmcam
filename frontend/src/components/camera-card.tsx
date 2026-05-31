import { useEffect, useRef, useState } from 'react'
import { CameraOff, Flashlight, Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { cameraSnapshotUrl, cameraStreamUrl, getCameraDisplayName, getCameraStats, setCameraAlias } from '@/lib/cameras'
import type { Camera, CameraStats } from '@/types/camera'

type StreamMode = 'snap' | 'live'

type CameraCardProps = {
  camera: Camera
  isFlashing: boolean
  isPaused: boolean
  onOpenFullscreen: (camera: Camera) => void
  onRename: (name: string, displayName: string) => void
  onToggleTorch: (camera: Camera) => void
  torchEnabled: boolean
}

export function CameraCard({ camera, isFlashing, isPaused, onOpenFullscreen, onRename, onToggleTorch, torchEnabled }: CameraCardProps) {
  const { token } = useAuth()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<StreamMode>('snap')
  const [snapshotSrc, setSnapshotSrc] = useState('')
  const [hasSignal, setHasSignal] = useState(true)
  const [stats, setStats] = useState<CameraStats | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const isOnline = camera.online !== false
  const isLive = (camera.video_connections ?? 0) > 0
  const displayName = getCameraDisplayName(camera)
  const src = isPaused ? '' : mode === 'live' ? cameraStreamUrl(camera.name) : snapshotSrc

  useEffect(() => {
    if (isPaused || mode !== 'snap') return undefined

    function refresh() {
      setSnapshotSrc(cameraSnapshotUrl(camera.name))
    }

    refresh()
    const id = window.setInterval(refresh, 3000)
    return () => window.clearInterval(id)
  }, [camera.name, isPaused, mode])

  useEffect(() => {
    if (isPaused || mode !== 'live') return undefined
    const image = imageRef.current
    return () => {
      if (image) image.src = ''
    }
  }, [isPaused, mode])

  useEffect(() => {
    let cancelled = false
    if (!token) return undefined
    const authToken = token

    async function loadStats() {
      try {
        const nextStats = await getCameraStats(authToken, camera.name)
        if (!cancelled) setStats(nextStats)
      } catch {
        if (!cancelled) setStats(null)
      }
    }

    void loadStats()
    return () => {
      cancelled = true
    }
  }, [camera.name, token])

  function toggleMode() {
    setMode((current) => (current === 'live' ? 'snap' : 'live'))
  }

  function startEdit() {
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
    } catch {
      // silently revert — the display name stays from props
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  return (
    <Card
      className={`overflow-hidden rounded-sm border-border bg-card transition ${isOnline ? '' : 'opacity-50'} ${
        isFlashing ? 'ring-2 ring-swarm-amber shadow-[0_0_40px_rgba(232,165,0,0.35)]' : ''
      }`}
    >
      <div className="relative aspect-video cursor-pointer overflow-hidden bg-[#030507]" onClick={() => onOpenFullscreen(camera)}>
        <img
          alt={`${displayName} kamera képe`}
          className="h-full w-full object-cover"
          onError={() => setHasSignal(false)}
          onLoad={() => setHasSignal(true)}
          ref={imageRef}
          src={src}
        />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_2px,rgba(0,0,0,0.055)_2px,rgba(0,0,0,0.055)_4px)]" />

        {!hasSignal ? (
          <div className="absolute inset-0 grid place-items-center bg-[#030507] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <CameraOff className="h-6 w-6" />
              No signal
            </div>
          </div>
        ) : null}

        <Badge
          className={`absolute left-2 top-2 border bg-background/80 font-mono ${
            isOnline ? (isLive ? 'border-swarm-green/40 text-swarm-green' : 'border-white/10 text-muted-foreground') : 'border-swarm-red/40 text-swarm-red'
          }`}
          variant="outline"
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          {isOnline ? (isLive ? 'LIVE' : 'IDLE') : 'OFFLINE'}
        </Badge>

        <Button
          className={mode === 'live' ? 'absolute bottom-2 right-2 border-swarm-green/40 text-swarm-green' : 'absolute bottom-2 right-2'}
          onClick={(event) => {
            event.stopPropagation()
            toggleMode()
          }}
          size="sm"
          variant="outline"
        >
          {mode === 'live' ? 'LIVE' : 'SNAP'}
        </Button>
        <Button
          className={torchEnabled ? 'absolute bottom-2 left-2 border-swarm-amber/50 bg-swarm-amber/10 text-swarm-amber' : 'absolute bottom-2 left-2'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleTorch(camera)
          }}
          size="sm"
          variant="outline"
        >
          <Flashlight className="mr-1.5 h-3.5 w-3.5" />
          Vaku
        </Button>
      </div>

      <div className="px-3 py-2 text-center">
        {isEditing ? (
          <input
            autoFocus
            className="w-full border-b border-swarm-amber bg-transparent text-center font-ui text-base font-bold tracking-[0.06em] text-foreground outline-none"
            onBlur={() => void commitEdit()}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            value={editValue}
          />
        ) : (
          <div
            className="group relative inline-flex max-w-full cursor-text items-center gap-1 truncate font-ui text-base font-bold tracking-[0.06em] text-foreground"
            onClick={startEdit}
            title="Kattints az átnevezéshez"
          >
            <span className="truncate">{displayName}</span>
            <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
          </div>
        )}
        <div className="mt-1 flex justify-center gap-4 font-mono text-[10px]">
          <span>
            <span className="text-muted-foreground">Cam</span>{' '}
            <span className="text-swarm-amber">{stats && stats.camera_fps > 0 ? stats.camera_fps : '—'}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Det</span>{' '}
            <span className="text-swarm-amber">{stats && stats.detection_fps > 0 ? stats.detection_fps : '—'}</span>
          </span>
        </div>
      </div>
    </Card>
  )
}
