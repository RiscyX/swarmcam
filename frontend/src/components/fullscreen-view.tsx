import { useEffect, useRef } from 'react'
import { Flashlight, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PulseDot } from '@/components/ui/pulse-dot'
import { cameraStreamUrl, getCameraDisplayName, wifiStrengthPercent } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type FullscreenViewProps = {
  camera: Camera | null
  onClose: () => void
  onToggleTorch: (camera: Camera) => void
  torchEnabled: boolean
}

function fmt(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

export function FullscreenView({ camera, onClose, onToggleTorch, torchEnabled }: FullscreenViewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!camera) return undefined

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [camera, onClose])

  useEffect(() => {
    const image = imageRef.current
    return () => {
      if (image) image.src = ''
    }
  }, [camera?.name])

  if (!camera) return null

  const telemetry: Array<[string, string]> = [
    ['FPS', '—'],
    ['BAT', camera.battery_level != null ? `${fmt(camera.battery_level)}%` : '—'],
    ['WIFI', wifiStrengthPercent(camera.wifi_strength)],
  ]

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex items-center gap-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent px-4 pb-6 pt-3">
        <PulseDot size={8} speed={1.6} tone={camera.online === false ? 'offline' : 'live'} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold leading-tight text-[var(--on-video)]">
            {getCameraDisplayName(camera)}
          </span>
          <span className="font-mono text-xs text-[var(--on-video-muted)]">{camera.ip}</span>
        </div>
        <Button
          className={
            torchEnabled
              ? 'border-[var(--video-amber)]/50 bg-[var(--video-amber)]/10 text-[var(--video-amber)]'
              : 'border-[var(--on-video-border)] text-[var(--on-video-secondary)] hover:border-[var(--on-video-muted)] hover:text-[var(--on-video)]'
          }
          onClick={() => onToggleTorch(camera)}
          size="sm"
          variant="outline"
        >
          <Flashlight className="mr-1.5 h-3.5 w-3.5" />
          Torch
        </Button>
        <span className="hidden shrink-0 border border-[var(--on-video-border)] px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-[var(--on-video-muted)] sm:inline">
          BACKGROUND STREAMS PAUSED
        </span>
        <button
          aria-label="Close fullscreen"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-[var(--on-video-secondary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--on-video)]"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <img
          alt={`${getCameraDisplayName(camera)} fullscreen stream`}
          className="h-full w-full object-contain"
          ref={imageRef}
          src={cameraStreamUrl(camera.name)}
        />
      </div>
      <div className="flex items-center gap-4 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pb-3 pt-6">
        <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
          {telemetry.map(([label, value]) => (
            <div className="flex min-w-0 items-baseline gap-1.5" key={label}>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-video-dim)]">{label}</dt>
              <dd className="tabular-nums text-[var(--on-video-secondary)]">{value}</dd>
            </div>
          ))}
        </dl>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--on-video-dim)]">ESC to close</span>
      </div>
    </div>
  )
}
