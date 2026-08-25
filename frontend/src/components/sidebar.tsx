import { Activity, Camera, Clapperboard, Radar, Settings, SlidersHorizontal, Smile, Users } from 'lucide-react'

import { PulseDot } from '@/components/ui/pulse-dot'
import { useAuth } from '@/hooks/use-auth'
import { useClock } from '@/hooks/use-clock'
import type { SectionId } from '@/lib/sections'
import type { CameraSocketStatus } from '@/types/events'

const navItems: Array<{ id: SectionId; label: string; icon: typeof Camera }> = [
  { id: 'cameras', label: 'Cameras', icon: Camera },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'discovery', label: 'Discovery', icon: Radar },
  { id: 'camera-settings', label: 'Cam Settings', icon: SlidersHorizontal },
  { id: 'events', label: 'Events', icon: Activity },
  { id: 'recordings', label: 'Recordings', icon: Clapperboard },
  { id: 'faces', label: 'Faces', icon: Smile },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type SidebarProps = {
  activeSection: SectionId
  liveEventCount: number
  onSectionChange: (section: SectionId) => void
  socketStatus: CameraSocketStatus
  variant: 'full' | 'rail'
}

function BrandMark() {
  return <span className="h-[14px] w-[14px] shrink-0 bg-[var(--accent)]" />
}

function WsStatus({ compact, socketStatus }: { compact?: boolean; socketStatus: CameraSocketStatus }) {
  const connected = socketStatus === 'connected'
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--fg-muted)]" title={`ws ${socketStatus}`}>
      <PulseDot animated={connected} size={6} speed={2.4} tone={connected ? 'live' : 'offline'} />
      {compact ? null : <span>ws {socketStatus}</span>}
    </div>
  )
}

export function Sidebar({ activeSection, liveEventCount, onSectionChange, socketStatus, variant }: SidebarProps) {
  const time = useClock()
  const { user } = useAuth()
  const isRail = variant === 'rail'

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-chrome)] ${
        isRail ? 'w-16' : 'w-[212px]'
      }`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-[var(--border-row)] ${
          isRail ? 'justify-center' : 'gap-2.5 px-4'
        }`}
      >
        <BrandMark />
        {isRail ? null : (
          <span className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--fg)]">SwarmCam</span>
        )}
      </div>

      <nav className={`flex min-h-0 flex-1 flex-col overflow-y-auto py-2 ${isRail ? 'items-center gap-0.5' : 'gap-0.5 px-0 py-2'}`}>
        {navItems.map((item) => {
          const active = activeSection === item.id
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={`group relative flex shrink-0 items-center transition-colors ${
                isRail
                  ? `h-12 w-full justify-center ${active ? 'bg-[var(--bg-surface)] text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:bg-white/[0.04] hover:text-[var(--fg)]'}`
                  : `h-11 gap-2.5 px-4 text-left text-sm ${
                      active
                        ? 'bg-[var(--bg-chrome)] font-extrabold text-[var(--fg)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]'
                        : 'text-[var(--fg-muted)] hover:bg-white/[0.04] hover:text-[var(--fg)]'
                    }`
              }`}
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              title={item.label}
              type="button"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {isRail ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.id === 'events' && liveEventCount > 0 ? (
                    <PulseDot size={6} tone="accent" />
                  ) : null}
                </>
              )}
            </button>
          )
        })}
      </nav>

      <div
        className={`shrink-0 space-y-1.5 border-t border-[var(--border-row)] font-mono text-[11px] text-[var(--fg-muted)] ${
          isRail ? 'flex flex-col items-center py-3' : 'px-4 py-3'
        }`}
      >
        {isRail ? (
          <>
            <WsStatus compact socketStatus={socketStatus} />
            <span className="font-mono text-[10px] text-[var(--fg-dim)]">{time}</span>
          </>
        ) : (
          <>
            <WsStatus socketStatus={socketStatus} />
            <div className="flex items-center gap-2">
              <span>{time}</span>
            </div>
            {user ? (
              <div className="truncate pt-0.5 text-[var(--fg-secondary)]">{user.username}</div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
