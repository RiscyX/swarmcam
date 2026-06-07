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
    <aside className="hidden w-52 shrink-0 border-r border-border bg-[#0a0d13] md:flex md:flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="text-[22px] font-black uppercase leading-none tracking-[0.22em] text-swarm-amber">SwarmCam</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">surveillance system</div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 py-3">
        {navItems.map((item) => (
          <button
            className={`flex items-center gap-3 px-5 py-2.5 text-left text-[13px] font-bold uppercase tracking-[0.12em] transition ${
              activeSection === item.id
                ? 'border-l-2 border-swarm-amber bg-swarm-amber/10 text-swarm-amber'
                : 'border-l-2 border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
            }`}
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            type="button"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border px-5 py-4 font-mono text-[10px] text-muted-foreground">
        <div className={`flex items-center gap-2 ${socketStatus === 'connected' ? 'text-swarm-green' : ''}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${socketStatus === 'connected' ? 'bg-swarm-green' : 'bg-swarm-red'}`} />
          ws {socketStatus}
        </div>
        <div className="flex items-center gap-2 text-swarm-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-swarm-amber" />
          {time}
        </div>
      </div>
    </aside>
  )
}
