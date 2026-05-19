import { Camera, Radar, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function App() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-52 shrink-0 border-r border-border bg-[#0a0d13] md:flex md:flex-col">
        <div className="border-b border-border px-5 py-5">
          <div className="text-[22px] font-black uppercase leading-none tracking-[0.22em] text-swarm-amber">SwarmCam</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">surveillance system</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 py-3">
          <button className="flex items-center gap-3 border-l-2 border-swarm-amber bg-swarm-amber/10 px-5 py-2.5 text-left text-[13px] font-bold uppercase tracking-[0.12em] text-swarm-amber" type="button">
            <Camera className="h-4 w-4" />
            Cameras
          </button>
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-[#0a0d13] px-5">
          <div className="flex-1 text-sm font-bold uppercase tracking-[0.18em]">Cameras</div>
          <Badge className="border-swarm-amber/30 bg-swarm-amber/10 font-mono text-swarm-amber" variant="outline">
            scaffold
          </Badge>
          <Button variant="outline">Kijelentkezés</Button>
        </header>

        <section className="grid flex-1 gap-4 p-5 lg:grid-cols-[1fr_360px]">
          <Card className="overflow-hidden border-border bg-card/90">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-swarm-amber/30 bg-swarm-amber/10 text-swarm-amber">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-ui text-2xl uppercase tracking-[0.16em] text-foreground">React frontend alap</CardTitle>
                  <CardDescription className="font-mono text-xs">Vite + TypeScript + Tailwind + shadcn/ui skeleton</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-border bg-[#030507]">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-swarm-amber/30 bg-swarm-amber/10 text-swarm-amber shadow-[0_0_60px_rgba(232,165,0,0.18)]">
                    <Radar className="h-8 w-8" />
                  </div>
                  <h1 className="font-ui text-4xl font-black uppercase tracking-[0.18em] text-swarm-amber">SwarmCam</h1>
                  <p className="mt-3 font-mono text-xs leading-6 text-muted-foreground">
                    Az új React dashboard helye elkészült. A következő körben jön az nginx proxy, majd az auth és a kamera grid átültetése.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-ui uppercase tracking-[0.14em]">
                <ShieldCheck className="h-4 w-4 text-swarm-green" />
                Build policy
              </CardTitle>
              <CardDescription>pnpm lockfile-only frontend build</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
              <div className="rounded-sm border border-border bg-background p-3">pnpm install --frozen-lockfile</div>
              <div className="rounded-sm border border-border bg-background p-3">runtime: nginx + static dist</div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

export default App
