import { BatteryCharging, BatteryLow, Eye, EyeOff } from 'lucide-react'

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
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-foreground">{pct}%</span>
    </div>
  )
}

export function HealthPage({ cameras, isLoading }: HealthPageProps) {
  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  }

  if (!cameras.length) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <p className="text-sm text-muted-foreground">No cameras. Run a discovery scan first.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Camera</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Battery</th>
            <th className="px-4 py-2.5 font-medium">Temp</th>
            <th className="px-4 py-2.5 font-medium">Free space</th>
            <th className="px-4 py-2.5 font-medium">Quality</th>
            <th className="px-4 py-2.5 font-medium">Night vision</th>
            <th className="px-4 py-2.5 font-medium">Connections</th>
          </tr>
        </thead>
        <tbody>
          {cameras.map((cam) => {
            const isOnline = cam.online !== false
            const isLive = (cam.video_connections ?? 0) > 0
            return (
              <tr
                className={`border-b border-border/50 last:border-0 transition-colors hover:bg-white/[0.02] ${!isOnline ? 'opacity-40' : ''}`}
                key={cam.name}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{getCameraDisplayName(cam)}</div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">{cam.ip}:{cam.port}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? (isLive ? 'bg-swarm-green' : 'bg-muted-foreground') : 'bg-swarm-red'}`} />
                    {isOnline ? (
                      <span className={`text-xs ${isLive ? 'text-swarm-green' : 'text-muted-foreground'}`}>
                        {isLive ? 'Live' : 'Idle'}
                      </span>
                    ) : (
                      <span className="text-xs text-swarm-red">Offline</span>
                    )}
                  </div>
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
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{fmt(cam.battery_temp_c, '°C')}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{fmt(cam.free_space_gb, ' GB')}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{fmt(cam.quality, '%')}</td>
                <td className="px-4 py-3">
                  {cam.night_vision == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : cam.night_vision ? (
                    <Eye className="h-3.5 w-3.5 text-foreground" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {cam.video_connections != null ? cam.video_connections : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
