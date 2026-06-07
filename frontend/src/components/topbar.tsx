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
    <header className="flex h-12 items-center gap-3 border-b border-border bg-swarm-panel px-4">
      <div className="flex-1 text-sm font-medium text-foreground">{sectionLabels[activeSection]}</div>
      <Badge className="font-mono text-xs" variant="secondary">
        {cameraCount} cam{cameraCount === 1 ? '' : 's'}
      </Badge>
      {activeSection === 'cameras' ? (
        <div className="flex items-center gap-0.5 rounded border border-border bg-background p-0.5">
          {cameraLayouts.map((layout) => (
            <Button
              key={layout.id}
              onClick={() => onCameraLayoutChange(layout.id)}
              size="sm"
              variant={cameraLayout === layout.id ? 'default' : 'ghost'}
              className="h-6 w-6 p-0 text-xs"
            >
              {layout.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Badge
        className={`font-mono text-xs ${socketStatus === 'connected' ? 'border-swarm-green/30 bg-swarm-green/10 text-swarm-green' : ''}`}
        variant="outline"
      >
        ws {socketStatus}
      </Badge>
      {activeSection === 'cameras' ? (
        <Button
          onClick={onToggleEventFeed}
          size="sm"
          variant={showEventFeed ? 'default' : 'outline'}
          className="h-7 text-xs"
        >
          {liveEventCount > 0 ? `Events (${liveEventCount})` : 'Events'}
        </Button>
      ) : null}
      {user ? (
        <span className="font-mono text-xs text-muted-foreground">{user.username}</span>
      ) : null}
      <Button onClick={logout} variant="outline" size="sm" className="h-7 text-xs">
        Logout
      </Button>
    </header>
  )
}
