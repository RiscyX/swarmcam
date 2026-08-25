import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LayoutPicker } from '@/components/layout-picker'
import { useAuth } from '@/hooks/use-auth'
import { sectionLabels, type SectionId } from '@/lib/sections'
import type { CameraLayout } from '@/types/camera'
import type { CameraSocketStatus } from '@/types/events'

type TopbarProps = {
  activeSection: SectionId
  cameraCount: number
  cameraLayout: CameraLayout
  camerasUp: number
  liveEventCount: number
  showEventFeed: boolean
  socketStatus: CameraSocketStatus
  onCameraLayoutChange: (layout: CameraLayout) => void
  onToggleEventFeed: () => void
}

export function Topbar({
  activeSection,
  cameraCount,
  cameraLayout,
  camerasUp,
  liveEventCount,
  onCameraLayoutChange,
  onToggleEventFeed,
  showEventFeed,
}: TopbarProps) {
  const { logout, user } = useAuth()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-row)] bg-[var(--bg-chrome)] px-4">
      <div className="min-w-0 shrink-0 text-sm font-bold text-[var(--fg)]">{sectionLabels[activeSection]}</div>
      <div className="hidden min-w-0 items-center rounded-sm border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--fg-muted)] lg:flex">
        <span className={camerasUp > 0 ? 'text-[var(--status-live)]' : ''}>
          {camerasUp}/{cameraCount} nodes up
        </span>
        <span className="px-1.5 text-[var(--fg-dim)]">·</span>
        <span>{cameraCount} mjpeg streams</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {activeSection === 'cameras' ? (
          <div className="hidden sm:block">
            <LayoutPicker layout={cameraLayout} onChange={onCameraLayoutChange} />
          </div>
        ) : null}
        <Badge className="hidden font-mono text-xs sm:inline-flex" variant="secondary">
          {cameraCount} cam{cameraCount === 1 ? '' : 's'}
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
          <span className="hidden font-mono text-xs text-[var(--fg-muted)] md:inline">{user.username}</span>
        ) : null}
        <Button onClick={logout} variant="outline" size="sm" className="h-7 text-xs">
          Logout
        </Button>
      </div>
    </header>
  )
}
