import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { sectionLabels, type SectionId } from '@/lib/sections'

type TopbarProps = {
  activeSection: SectionId
}

export function Topbar({ activeSection }: TopbarProps) {
  const { logout, user } = useAuth()

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-[#0a0d13] px-5">
      <div className="flex-1 text-sm font-bold uppercase tracking-[0.18em]">{sectionLabels[activeSection]}</div>
      <Badge className="border-swarm-amber/30 bg-swarm-amber/10 font-mono text-swarm-amber" variant="outline">
        0 cameras
      </Badge>
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
