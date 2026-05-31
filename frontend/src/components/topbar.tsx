import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { sectionLabels, type SectionId } from '@/lib/sections'
import type { CameraLayout } from '@/types/camera'
import type { CameraSocketStatus } from '@/types/events'

type TopbarProps = {
  activeSection: SectionId
  cameraCount: number
  cameraLayout: CameraLayout
  liveEventCount: number
  showEventFeed: boolean
  socketStatus: CameraSocketStatus
  onCameraLayoutChange: (layout: CameraLayout) => void
  onToggleEventFeed: () => void
}

const cameraLayouts: Array<{ id: CameraLayout; label: string }> = [
  { id: '1x1', label: '1' },
  { id: '2x2', label: '2' },
  { id: '1plus3', label: '3' },
]

export function Topbar({ activeSection, cameraCount, cameraLayout, liveEventCount, onCameraLayoutChange, onToggleEventFeed, showEventFeed, socketStatus }: TopbarProps) {
  const { logout, user } = useAuth()

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-[#0a0d13] px-5">
      <div className="flex-1 text-sm font-bold uppercase tracking-[0.18em]">{sectionLabels[activeSection]}</div>
      <Badge className="border-swarm-amber/30 bg-swarm-amber/10 font-mono text-swarm-amber" variant="outline">
        {cameraCount} camera{cameraCount === 1 ? '' : 's'}
      </Badge>
      {activeSection === 'cameras' ? (
        <div className="flex items-center gap-1 rounded-sm border border-border bg-background p-1">
          {cameraLayouts.map((layout) => (
            <Button
              key={layout.id}
              onClick={() => onCameraLayoutChange(layout.id)}
              size="sm"
              variant={cameraLayout === layout.id ? 'default' : 'ghost'}
            >
              {layout.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Badge
        className={socketStatus === 'connected' ? 'border-swarm-green/30 bg-swarm-green/10 font-mono text-swarm-green' : 'font-mono'}
        variant="outline"
      >
        ws {socketStatus}
      </Badge>
      {activeSection === 'cameras' ? (
        <Button
          onClick={onToggleEventFeed}
          size="sm"
          variant={showEventFeed ? 'default' : 'outline'}
        >
          {liveEventCount > 0 ? `Events (${liveEventCount})` : 'Events'}
        </Button>
      ) : null}
      {user ? (
        <Badge className="font-mono" variant="secondary">
          {user.username}:{user.role}
        </Badge>
      ) : null}
      <Button onClick={logout} variant="outline">
        Kijelentkezés
      </Button>
    </header>
  )
}
