import { Camera, ShieldCheck } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SectionId } from '@/lib/sections'

type PlaceholderPageProps = {
  section: SectionId
  title: string
}

export function PlaceholderPage({ section, title }: PlaceholderPageProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden border-border bg-card/90">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-swarm-amber/30 bg-swarm-amber/10 text-swarm-amber">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-ui text-2xl uppercase tracking-[0.16em] text-foreground">{title}</CardTitle>
              <CardDescription className="font-mono text-xs">React migration placeholder: {section}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-border bg-[#030507]">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-swarm-amber/30 bg-swarm-amber/10 text-swarm-amber shadow-[0_0_60px_rgba(232,165,0,0.18)]">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h1 className="font-ui text-4xl font-black uppercase tracking-[0.18em] text-swarm-amber">SwarmCam</h1>
              <p className="mt-3 font-mono text-xs leading-6 text-muted-foreground">
                The app shell and auth layer are ready. In the next iterations, this placeholder will receive the real
                camera, health, discovery, and settings functions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Migration status</CardTitle>
          <CardDescription>Issue #8 shell/auth baseline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
          <div className="rounded-sm border border-border bg-background p-3">auth: Frigate JWT proxy</div>
          <div className="rounded-sm border border-border bg-background p-3">routing: local section state</div>
          <div className="rounded-sm border border-border bg-background p-3">api: no hardcoded localhost</div>
        </CardContent>
      </Card>
    </div>
  )
}
