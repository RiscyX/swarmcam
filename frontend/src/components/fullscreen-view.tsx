import { useEffect, useRef } from 'react'
import { Flashlight, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PulseDot } from '@/components/ui/pulse-dot'
import { cameraStreamUrl, getCameraDisplayName } from '@/lib/cameras'
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
    ['BAT', camera.battery_level != null ? `${fmt(camera.battery_level)}%${camera.battery_charging ? ' ⚡' : ''}` : '—'],
    ['TEMP', camera.battery_temp_c != null ? `${fmt(Math.round(camera.battery_temp_c))}°C` : '—'],
    ['DISK', camera.free_space_gb != null ? `${fmt(Number(camera.free_space_gb.toFixed(1)))}GB` : '—'],
    ['IR', camera.night_vision == null ? '—' : camera.night_vision ? 'ON' : 'OFF'],
  ]

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex items-center gap-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent px-4 pb-6 pt-3">
        <PulseDot size={8} speed={1.6} tone={camera.online === false ? 'offline' : 'live'} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold leading-tight text-[var(--fg)]">
            {getCameraDisplayName(camera)}
          </span>
          <span className="font-mono text-xs text-[var(--fg-muted)]">{camera.ip}</span>
        </div>
        <Button
          className={torchEnabled ? 'border-swarm-amber/50 bg-swarm-amber/10 text-swarm-amber' : ''}
          onClick={() => onToggleTorch(camera)}
          size="sm"
          variant="outline"
        >
          <Flashlight className="mr-1.5 h-3.5 w-3.5" />
          Torch
        </Button>
        <span className="hidden shrink-0 border border-[var(--border-raised)] px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-[var(--fg-muted)] sm:inline">
          BACKGROUND STREAMS PAUSED
        </span>
        <button
          aria-label="Close fullscreen"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-[var(--fg-secondary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--fg)]"
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
              <dt className="text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">{label}</dt>
              <dd className="tabular-nums text-[var(--fg-secondary)]">{value}</dd>
            </div>
          ))}
        </dl>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">ESC to close</span>
      </div>
    </div>
  )
}
