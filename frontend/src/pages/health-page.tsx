import { Button } from '@/components/ui/button'
import { PulseDot } from '@/components/ui/pulse-dot'
import { StatusPill } from '@/components/ui/status-pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCameraDisplayName, wifiStrengthPercent } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type HealthPageProps = {
  cameras: Camera[]
  isLoading: boolean
  onOpenStream?: (camera: Camera) => void
  onReload?: () => void
}

const DIM_DASH = (
  <span className="text-[var(--fg-dim)]">—</span>
)

function clampPercent(level: number): number {
  return Math.max(0, Math.min(100, level))
}

function batteryBarClass(pct: number): string {
  if (pct <= 20) return 'bg-[var(--status-error)]'
  if (pct <= 50) return 'bg-[var(--status-idle)]'
  return 'bg-[var(--status-live)]'
}

export function HealthPage({ cameras, isLoading, onOpenStream, onReload }: HealthPageProps) {
  if (!cameras.length) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : 'No cameras. Run a discovery scan first.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Camera health <span className="text-[var(--fg-dim)]">· {cameras.length}</span>
        </h1>
        <Button disabled={isLoading} onClick={() => onReload?.()} size="sm" variant="outline">
          {isLoading ? 'Polling…' : 'Poll now'}
        </Button>
      </div>

      {/* Desktop — table */}
      <div className="hidden overflow-hidden rounded-sm border border-[var(--border-raised)] md:block">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Camera</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Battery</TableHead>
              <TableHead>Wi-Fi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cameras.map((cam) => {
              const isOnline = cam.online !== false
              const pct = cam.battery_level != null ? clampPercent(cam.battery_level) : null
              return (
                <TableRow className={isOnline ? undefined : 'opacity-60'} key={cam.name}>
                  <TableCell>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--fg)]">
                      {getCameraDisplayName(cam)}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--fg-muted)]">
                      {cam.ip}:{cam.port}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isOnline ? (
                      <StatusPill tone="idle">Online</StatusPill>
                    ) : (
                      <StatusPill tone="offline">Offline</StatusPill>
                    )}
                  </TableCell>
                  <TableCell>
                    {!isOnline || pct == null ? (
                      DIM_DASH
                    ) : (
                      <div className="flex items-center gap-2">
                        <div aria-hidden="true" className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--track)]">
                          <div
                            className={`h-full transition-all ${batteryBarClass(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums text-[var(--fg-secondary)]">{pct}%</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell variant="mono">{isOnline ? wifiStrengthPercent(cam.wifi_strength) : DIM_DASH}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile — cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {cameras.map((cam) => {
          const isOnline = cam.online !== false
          const pct = cam.battery_level != null ? clampPercent(cam.battery_level) : null
          const cells: Array<[string, string]> = [
            ['Bat', !isOnline || pct == null ? '—' : `${pct}%`],
            ['Wi-Fi', isOnline ? wifiStrengthPercent(cam.wifi_strength) : '—'],
            ['Fps', '—'],
          ]
          return (
            <div
              className="overflow-hidden rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)]"
              key={cam.name}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                {!isOnline ? <PulseDot animated={false} size={6} tone="offline" /> : null}
                <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">
                  {getCameraDisplayName(cam)}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--fg-muted)]">
                  {cam.ip}:{cam.port}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-[var(--border-row)]">
                {cells.map(([label, value]) => (
                  <div className="bg-[var(--bg-surface)] px-3 py-2" key={label}>
                    <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">
                      {label}
                    </div>
                    <div
                      className={`font-mono text-[11px] ${
                        value === '—' ? 'text-[var(--fg-dim)]' : 'text-[var(--fg-secondary)]'
                      }`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--border-row)] p-2">
                <Button className="w-full" onClick={() => onOpenStream?.(cam)} size="sm" variant="outline">
                  Open stream
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
