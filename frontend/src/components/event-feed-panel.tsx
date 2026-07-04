import { apiUrl } from '@/lib/api'
import { getCameraDisplayName } from '@/lib/cameras'
import type { Camera } from '@/types/camera'
import type { FrigateLiveEvent } from '@/types/events'

type EventFeedPanelProps = {
  cameras: Camera[]
  events: FrigateLiveEvent[]
  onClear: () => void
}

const labelColors: Record<string, string> = {
  person: 'text-swarm-green border-swarm-green/40',
  car: 'text-swarm-amber border-swarm-amber/40',
  dog: 'text-swarm-amber border-swarm-amber/40',
  cat: 'text-swarm-amber border-swarm-amber/40',
  fire: 'text-red-400 border-red-400/40',
  smoke: 'text-slate-400 border-slate-400/40',
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

export function EventFeedPanel({ cameras, events, onClear }: EventFeedPanelProps) {
  function getDisplayName(cameraName: string | null | undefined) {
    if (!cameraName) return '—'
    const cam = cameras.find((c) => c.name === cameraName)
    return cam ? getCameraDisplayName(cam) : cameraName
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-foreground">Event Feed</span>
        {events.length > 0 ? (
          <button
            className="font-mono text-[10px] text-muted-foreground transition hover:text-foreground"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <p className="font-mono text-[10px] text-muted-foreground">Várakozás Frigate eseményekre...</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => {
              const labelClass = ev.label ? (labelColors[ev.label] ?? 'text-muted-foreground border-border') : 'text-muted-foreground border-border'
              return (
                <li key={`${ev.id ?? ''}-${ev.receivedAt}`} className="flex gap-2.5 p-2.5">
                  {ev.id ? (
                    <img
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-sm object-cover"
                      src={apiUrl(`/api/events/${ev.id}/thumbnail`)}
                    />
                  ) : (
                    <div className="h-14 w-20 shrink-0 rounded-sm bg-background" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      {ev.label ? (
                        <span className={`rounded-sm border px-1 py-0.5 font-mono text-[10px] uppercase ${labelClass}`}>
                          {ev.label}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">—</span>
                      )}
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {relativeTime(ev.receivedAt)}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-foreground/70">
                      {getDisplayName(ev.camera)}
                    </div>
                    {ev.score != null ? (
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {Math.round(ev.score * 100)}%
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
