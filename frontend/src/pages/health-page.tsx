import { BatteryCharging, BatteryLow, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { getCameraDisplayName } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type HealthPageProps = {
  cameras: Camera[]
  isLoading: boolean
}

function fmt(value: number | null | undefined, suffix = ''): string {
  return value != null ? `${value}${suffix}` : '—'
}

function BatteryBar({ level }: { level: number | null | undefined }) {
  if (level == null) return <span className="text-muted-foreground">—</span>
  const pct = Math.max(0, Math.min(100, level))
  const color = pct <= 20 ? 'bg-swarm-red' : pct <= 50 ? 'bg-swarm-amber' : 'bg-swarm-green'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-border">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums">{pct}%</span>
    </div>
  )
}

export function HealthPage({ cameras, isLoading }: HealthPageProps) {
  if (isLoading) {
    return <div className="font-mono text-sm text-muted-foreground">Betöltés...</div>
  }

  if (!cameras.length) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-border bg-card/70 p-8 text-center">
        <p className="font-mono text-xs text-muted-foreground">Nincs kamera. Futtass discovery scan-t.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-card">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="border-b border-border bg-background/60 text-left text-muted-foreground">
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Kamera</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Állapot</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Akku</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Hőfok</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Szabad hely</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Minőség</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Éjjellátó</th>
            <th className="px-4 py-3 font-bold uppercase tracking-[0.12em]">Stream</th>
          </tr>
        </thead>
        <tbody>
          {cameras.map((cam, i) => {
            const isOnline = cam.online !== false
            const isLive = (cam.video_connections ?? 0) > 0
            return (
              <tr
                className={`border-b border-border last:border-0 transition-colors hover:bg-white/[0.02] ${!isOnline ? 'opacity-50' : ''} ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}
                key={cam.name}
              >
                <td className="px-4 py-3">
                  <div className="font-ui font-bold tracking-[0.06em] text-foreground">{getCameraDisplayName(cam)}</div>
                  <div className="mt-0.5 text-muted-foreground">{cam.ip}:{cam.port}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      isOnline
                        ? isLive
                          ? 'border-swarm-green/40 bg-swarm-green/10 text-swarm-green'
                          : 'border-border bg-background text-muted-foreground'
                        : 'border-swarm-red/40 bg-swarm-red/10 text-swarm-red'
                    }
                    variant="outline"
                  >
                    {isOnline ? (
                      <><Wifi className="mr-1 h-2.5 w-2.5" />{isLive ? 'LIVE' : 'IDLE'}</>
                    ) : (
                      <><WifiOff className="mr-1 h-2.5 w-2.5" />OFFLINE</>
                    )}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <BatteryBar level={cam.battery_level} />
                    {cam.battery_charging ? (
                      <BatteryCharging className="h-3 w-3 text-swarm-green" />
                    ) : cam.battery_level != null && cam.battery_level <= 20 ? (
                      <BatteryLow className="h-3 w-3 text-swarm-red" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmt(cam.battery_temp_c, '°C')}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmt(cam.free_space_gb, ' GB')}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmt(cam.quality, '%')}
                </td>
                <td className="px-4 py-3">
                  {cam.night_vision == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : cam.night_vision ? (
                    <Eye className="h-3.5 w-3.5 text-swarm-amber" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {cam.video_connections != null ? `${cam.video_connections} conn` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
