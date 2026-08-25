import { CameraOff } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CameraCard } from '@/components/camera-card'
import { LayoutPicker } from '@/components/layout-picker'
import { Button } from '@/components/ui/button'
import { useBreakpoint } from '@/hooks/use-breakpoint'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import type { Camera, CameraLayout } from '@/types/camera'

type CamerasPageProps = {
  cameras: Camera[]
  error: string | null
  isLoading: boolean
  onReload: () => void
  eventCamera: string | null
  layout: CameraLayout
  onLayoutChange: (layout: CameraLayout) => void
  onOpenFullscreen: (camera: Camera) => void
  onRenameCamera: (name: string, displayName: string) => void
  onToggleTorch: (camera: Camera) => void
  paused: boolean
  torchStates: Record<string, boolean>
}

export function CamerasPage({
  cameras,
  error,
  eventCamera,
  isLoading,
  layout,
  onLayoutChange,
  onOpenFullscreen,
  onRenameCamera,
  onReload,
  onToggleTorch,
  paused,
  torchStates,
}: CamerasPageProps) {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'

  const [shortcuts] = useState(() => ({
    '1': () => onLayoutChange('single'),
    '2': () => onLayoutChange('2x2'),
    '3': () => onLayoutChange('3x3'),
  }))

  useKeyboardShortcuts(shortcuts)

  // A spotlight (FOCUS) megjelenítése a #46 feladata; addig auto-ként viselkedik.
  const effectiveLayout: CameraLayout = layout === 'spotlight' ? 'auto' : layout

  const visibleCameras = useMemo(() => {
    if (isMobile) return cameras
    if (effectiveLayout === '2x2') return cameras.slice(0, 4)
    if (effectiveLayout === '3x3') return cameras.slice(0, 9)
    if (effectiveLayout === 'single') {
      const focused = cameras.find((camera) => camera.name === eventCamera) ?? cameras[0]
      return focused ? [focused] : []
    }
    return cameras
  }, [cameras, effectiveLayout, eventCamera, isMobile])

  const cols =
    effectiveLayout === 'single'
      ? 1
      : effectiveLayout === '2x2'
        ? 2
        : effectiveLayout === '3x3'
          ? breakpoint === 'tablet'
            ? 2
            : 3
          : breakpoint === 'tablet'
            ? 2
            : Math.ceil(Math.sqrt(Math.max(visibleCameras.length, 1)))
  const rows = Math.max(1, Math.ceil(visibleCameras.length / cols))

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading cameras...</div>
  }

  if (error) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center">
        <CameraOff className="h-8 w-8 text-swarm-red" />
        <div className="text-sm font-medium text-foreground">Camera API error</div>
        <p className="font-mono text-xs text-muted-foreground">{error}</p>
        <Button onClick={onReload} size="sm" variant="outline">Retry</Button>
      </div>
    )
  }

  if (!cameras.length) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
        <CameraOff className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">No cameras</div>
        <p className="text-xs text-muted-foreground">Run a network scan on the Discovery page to detect IP Webcam devices.</p>
      </div>
    )
  }

  const renderCard = (camera: Camera) => (
    <CameraCard
      camera={camera}
      isFlashing={eventCamera === camera.name}
      isPaused={paused}
      onOpenFullscreen={onOpenFullscreen}
      onRename={onRenameCamera}
      onToggleTorch={onToggleTorch}
      torchEnabled={Boolean(torchStates[camera.name])}
    />
  )

  if (isMobile) {
    return (
      <div>
        <div className="sticky top-0 z-10 shrink-0 border-b border-[var(--border-row)] bg-[var(--bg-chrome)]">
          <LayoutPicker layout={layout} onChange={onLayoutChange} variant="chips" />
        </div>
        <div className="flex flex-col gap-px bg-[var(--border)]">
          {visibleCameras.map((camera) => (
            <div className="aspect-video bg-[var(--bg-tile)] [&>*]:h-full" key={camera.name}>
              {renderCard(camera)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="min-h-0 min-w-0"
        style={{
          display: 'grid',
          flex: 1,
          minHeight: 0,
          gap: '2px',
          backgroundColor: 'var(--border)',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {visibleCameras.map((camera) => (
          <div className="bg-[var(--bg-tile)] [&>*]:h-full" key={camera.name}>
            {renderCard(camera)}
          </div>
        ))}
      </div>
    </div>
  )
}
