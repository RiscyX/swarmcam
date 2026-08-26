import { CameraOff } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CameraCard } from '@/components/camera-card'
import { CameraSpotlight } from '@/components/camera-spotlight'
import { LayoutPicker } from '@/components/layout-picker'
import { Button } from '@/components/ui/button'
import { useBreakpoint } from '@/hooks/use-breakpoint'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import type { Camera, CameraLayout } from '@/types/camera'

type CamerasPageProps = {
  cameras: Camera[]
  error: string | null
  focusId: string | null
  isLoading: boolean
  onReload: () => void
  eventCamera: string | null
  layout: CameraLayout
  onFocusChange: (name: string) => void
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
  focusId,
  isLoading,
  layout,
  onFocusChange,
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
    '1': () => onLayoutChange('auto'),
    '2': () => onLayoutChange('2x2'),
    '3': () => onLayoutChange('3x3'),
    '4': () => onLayoutChange('spotlight'),
  }))

  useKeyboardShortcuts(shortcuts)

  const visibleCameras = useMemo(() => {
    if (layout === '2x2') return cameras.slice(0, 4)
    if (layout === '3x3') return cameras.slice(0, 9)
    return cameras
  }, [cameras, layout])

  const count = Math.max(visibleCameras.length, 1)
  const autoCols = isMobile ? (count <= 1 ? 1 : Math.min(Math.ceil(Math.sqrt(count)), 3)) : Math.ceil(Math.sqrt(count))
  const cols = layout === '2x2' ? 2 : layout === '3x3' ? (breakpoint === 'tablet' || isMobile ? 2 : 3) : autoCols
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

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gap: '2px',
    backgroundColor: 'var(--border)',
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isMobile ? (
        <div className="shrink-0 border-b border-[var(--border-row)] bg-[var(--bg-chrome)]">
          <LayoutPicker layout={layout} onChange={onLayoutChange} variant="chips" />
        </div>
      ) : null}
      {layout === 'spotlight' ? (
        <CameraSpotlight
          cameras={visibleCameras}
          eventCamera={eventCamera}
          focusId={focusId}
          isPaused={paused}
          onFocusChange={onFocusChange}
          onOpenFullscreen={onOpenFullscreen}
          onRenameCamera={onRenameCamera}
          onToggleTorch={onToggleTorch}
          torchStates={torchStates}
        />
      ) : (
        <div className="min-h-0 min-w-0 flex-1" style={gridStyle}>
          {visibleCameras.map((camera) => (
            <div className="bg-[var(--bg-tile)] [&>*]:h-full" key={camera.name}>
              <CameraCard
                camera={camera}
                isFlashing={eventCamera === camera.name}
                isPaused={paused}
                onOpenFullscreen={onOpenFullscreen}
                onRename={onRenameCamera}
                onToggleTorch={onToggleTorch}
                torchEnabled={Boolean(torchStates[camera.name])}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
