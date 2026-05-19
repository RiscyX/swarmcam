import { useEffect, useRef } from 'react'
import { Flashlight, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cameraStreamUrl, getCameraDisplayName } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type FullscreenViewProps = {
  camera: Camera | null
  onClose: () => void
  onToggleTorch: (camera: Camera) => void
  torchEnabled: boolean
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

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2">
        <div className="flex-1 font-ui text-sm font-bold uppercase tracking-[0.16em] text-swarm-amber">
          {getCameraDisplayName(camera)}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">ESC = kilépés</div>
        <Button
          className={torchEnabled ? 'border-swarm-amber/50 bg-swarm-amber/10 text-swarm-amber' : ''}
          onClick={() => onToggleTorch(camera)}
          variant="outline"
        >
          <Flashlight className="mr-2 h-4 w-4" />
          {torchEnabled ? 'Vaku be' : 'Vaku'}
        </Button>
        <Button onClick={onClose} size="icon" variant="ghost">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <img
          alt={`${getCameraDisplayName(camera)} fullscreen stream`}
          className="h-full w-full object-contain"
          ref={imageRef}
          src={cameraStreamUrl(camera.name)}
        />
      </div>
    </div>
  )
}
