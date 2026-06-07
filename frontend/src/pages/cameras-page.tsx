import { CameraOff } from 'lucide-react'
import { useState } from 'react'

import { CameraCard } from '@/components/camera-card'
import { Button } from '@/components/ui/button'
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

const layoutClasses: Record<CameraLayout, string> = {
  auto: 'grid-cols-[repeat(auto-fill,minmax(380px,1fr))]',
  '1x1': 'mx-auto max-w-5xl grid-cols-1',
  '2x2': 'grid-cols-1 lg:grid-cols-2',
  '1plus3': 'grid-cols-1 lg:grid-cols-[2fr_1fr] lg:[&>*:first-child]:row-span-2',
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
  const [shortcuts] = useState(() => ({
    '1': () => onLayoutChange('1x1'),
    '2': () => onLayoutChange('2x2'),
    '3': () => onLayoutChange('1plus3'),
  }))

  useKeyboardShortcuts(shortcuts)

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

  return (
    <div className={`grid gap-px bg-border ${layoutClasses[layout]}`}>
      {cameras.map((camera) => (
        <div className="bg-background" key={camera.name}>
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
  )
}
