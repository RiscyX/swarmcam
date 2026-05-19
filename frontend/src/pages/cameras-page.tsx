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
  layout: CameraLayout
  onLayoutChange: (layout: CameraLayout) => void
}

const layoutClasses: Record<CameraLayout, string> = {
  auto: 'grid-cols-[repeat(auto-fill,minmax(310px,1fr))]',
  '1x1': 'mx-auto max-w-5xl grid-cols-1',
  '2x2': 'grid-cols-1 lg:grid-cols-2',
  '1plus3': 'grid-cols-1 lg:grid-cols-[2fr_1fr] lg:[&>*:first-child]:row-span-2',
}

export function CamerasPage({ cameras, error, isLoading, layout, onLayoutChange, onReload }: CamerasPageProps) {
  const [shortcuts] = useState(() => ({
    '1': () => onLayoutChange('1x1'),
    '2': () => onLayoutChange('2x2'),
    '3': () => onLayoutChange('1plus3'),
  }))

  useKeyboardShortcuts(shortcuts)

  if (isLoading) {
    return <div className="font-mono text-sm text-muted-foreground">Kamerák betöltése...</div>
  }

  if (error) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-sm border border-border bg-card p-8 text-center">
        <div>
          <CameraOff className="mx-auto mb-4 h-10 w-10 text-swarm-red" />
          <div className="font-ui text-xl font-bold uppercase tracking-[0.16em] text-foreground">Kamera API hiba</div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{error}</p>
          <Button className="mt-5" onClick={onReload} variant="outline">
            Újrapróbálás
          </Button>
        </div>
      </div>
    )
  }

  if (!cameras.length) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-sm border border-dashed border-border bg-card/70 p-8 text-center">
        <div className="max-w-md">
          <CameraOff className="mx-auto mb-4 h-11 w-11 text-muted-foreground" />
          <div className="font-ui text-2xl font-bold uppercase tracking-[0.16em] text-foreground">No cameras detected</div>
          <p className="mt-2 font-mono text-xs leading-6 text-muted-foreground">
            Futtass hálózati scan-t a Discovery fülön, hogy az IP Webcam eszközök bekerüljenek a dashboardba.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 ${layoutClasses[layout]}`}>
      {cameras.map((camera) => (
        <CameraCard camera={camera} key={camera.name} />
      ))}
    </div>
  )
}
