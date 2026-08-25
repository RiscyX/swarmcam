import { useEffect, useRef, useState } from 'react'
import { CameraOff, Flashlight, Pencil } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { cameraStreamUrl, getCameraDisplayName, getCameraStats, setCameraAlias } from '@/lib/cameras'
import type { Camera, CameraStats } from '@/types/camera'

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
  const [hasSignal, setHasSignal] = useState(true)
  const [stats, setStats] = useState<CameraStats | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const isOnline = camera.online !== false
  const isLive = (camera.video_connections ?? 0) > 0
  const displayName = getCameraDisplayName(camera)
  const src = isPaused ? '' : cameraStreamUrl(camera.name)

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
    return () => { cancelled = true }
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

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden bg-black ${isOnline ? '' : 'opacity-40'} ${
        isFlashing ? 'ring-2 ring-inset ring-swarm-blue' : ''
      }`}
      onClick={() => onOpenFullscreen(camera)}
    >
      <img
        alt={`${displayName} stream`}
        className="h-full w-full object-cover"
        onError={() => setHasSignal(false)}
        onLoad={() => setHasSignal(true)}
        ref={imageRef}
        src={src}
      />

      {!hasSignal && (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950">
          <div className="flex flex-col items-center gap-2 text-zinc-600">
            <CameraOff className="h-6 w-6" />
            <span className="text-xs">No signal</span>
          </div>
        </div>
      )}

      {/* Torch button — top right, visible on hover */}
      <button
        className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-black/70 opacity-0 transition-all hover:bg-black/90 group-hover:opacity-100 ${torchEnabled ? 'text-swarm-amber opacity-100' : 'text-white/70'}`}
        onClick={(e) => { e.stopPropagation(); onToggleTorch(camera) }}
        title="Toggle torch"
      >
        <Flashlight className="h-3.5 w-3.5" />
      </button>

      {/* Bottom overlay: name + status */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-8">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                autoFocus
                className="w-full border-b border-white/40 bg-transparent text-xs font-medium text-white outline-none"
                onBlur={() => void commitEdit()}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                ref={inputRef}
                value={editValue}
              />
            ) : (
              <div
                className="group/name inline-flex max-w-full items-center gap-1 truncate"
                onClick={startEdit}
                title="Click to rename"
              >
                <span className="truncate text-xs font-medium text-white/90">{displayName}</span>
                <Pencil className="h-2.5 w-2.5 shrink-0 text-white/40 opacity-0 transition-opacity group-hover/name:opacity-100" />
              </div>
            )}
            {(stats?.camera_fps ?? 0) > 0 && (
              <div className="mt-0.5 font-mono text-[10px] text-white/40">
                {stats!.camera_fps} fps · det {stats!.detection_fps}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? (isLive ? 'bg-swarm-green' : 'bg-white/30') : 'bg-swarm-red'}`} />
            <span className={`font-mono text-[10px] ${isOnline ? (isLive ? 'text-swarm-green' : 'text-white/40') : 'text-swarm-red'}`}>
              {isOnline ? (isLive ? 'Live' : 'Idle') : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
