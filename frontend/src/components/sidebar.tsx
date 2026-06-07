import { Activity, Camera, Clapperboard, Radar, SlidersHorizontal, Smile, Users } from 'lucide-react'

import { useClock } from '@/hooks/use-clock'
import type { CameraSocketStatus } from '@/types/events'
import type { SectionId } from '@/lib/sections'

const navItems: Array<{ id: SectionId; label: string; icon: typeof Camera }> = [
  { id: 'cameras', label: 'Cameras', icon: Camera },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'discovery', label: 'Discovery', icon: Radar },
  { id: 'camera-settings', label: 'Cam Settings', icon: SlidersHorizontal },
  { id: 'events', label: 'Events', icon: Activity },
  { id: 'recordings', label: 'Recordings', icon: Clapperboard },
  { id: 'faces', label: 'Faces', icon: Smile },
  { id: 'users', label: 'Users', icon: Users },
]

type SidebarProps = {
  activeSection: SectionId
  onSectionChange: (section: SectionId) => void
  socketStatus: CameraSocketStatus
}

export function Sidebar({ activeSection, onSectionChange, socketStatus }: SidebarProps) {
  const time = useClock()

  return (
    <aside className="hidden w-48 shrink-0 border-r border-border bg-swarm-panel md:flex md:flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="text-base font-semibold text-foreground">SwarmCam</div>
        <div className="mt-0.5 text-xs text-muted-foreground">surveillance system</div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 py-2">
        {navItems.map((item) => (
          <button
            className={`flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
              activeSection === item.id
                ? 'border-l-2 border-swarm-blue bg-swarm-blue/10 text-swarm-blue'
                : 'border-l-2 border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            type="button"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="space-y-1.5 border-t border-border px-4 py-3 font-mono text-[11px] text-muted-foreground">
        <div className={`flex items-center gap-2 ${socketStatus === 'connected' ? 'text-swarm-green' : ''}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${socketStatus === 'connected' ? 'bg-swarm-green' : 'bg-swarm-red'}`} />
          ws {socketStatus}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          {time}
        </div>
      </div>
    </aside>
  )
}
