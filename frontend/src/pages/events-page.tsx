import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { getCameraDisplayName } from '@/lib/cameras'
import { type EventFilters, type FrigateEvent, eventThumbnailUrl, formatEventTime, getEvents } from '@/lib/events'
import type { Camera } from '@/types/camera'

const LABELS = ['person', 'car', 'dog', 'cat', 'bird', 'motorcycle', 'bicycle']

type EventsPageProps = {
  cameras: Camera[]
}

function EventDialog({ event, onClose }: { event: FrigateEvent; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-sm border border-border" onClick={(e) => e.stopPropagation()}>
        <img alt={event.label} className="block max-h-[85vh] w-auto" src={eventThumbnailUrl(event.id)} />
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/70 px-4 py-2">
          <span className="font-mono text-xs text-foreground">
            {event.label} · {event.camera} · {formatEventTime(event.start_time)}
          </span>
          <Button onClick={onClose} size="sm" variant="outline">Bezárás</Button>
        </div>
      </div>
    </div>
  )
}

export function EventsPage({ cameras }: EventsPageProps) {
  const { token } = useAuth()
  const [filters, setFilters] = useState<EventFilters>({ limit: 50 })
  const [events, setEvents] = useState<FrigateEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<FrigateEvent | null>(null)
  const didLoad = useRef(false)

  async function load(f: EventFilters = filters) {
    if (!token) return
    setLoading(true)
    try {
      setEvents(await getEvents(token, f))
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!didLoad.current) { didLoad.current = true; void load() }
  })

  function setFilter(key: keyof EventFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }))
  }

  function getCamDisplay(name: string) {
    const cam = cameras.find((c) => c.name === name)
    return cam ? getCameraDisplayName(cam) : name
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Kamera</label>
          <select className="rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber" onChange={(e) => setFilter('camera', e.target.value)} value={filters.camera ?? ''}>
            <option value="">Összes</option>
            {cameras.map((c) => <option key={c.name} value={c.name}>{getCameraDisplayName(c)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Objektum</label>
          <select className="rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber" onChange={(e) => setFilter('label', e.target.value)} value={filters.label ?? ''}>
            <option value="">Összes</option>
            {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Limit</label>
          <select className="rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-swarm-amber" onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value) }))} value={filters.limit ?? 50}>
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <Button disabled={loading} onClick={() => void load()} variant="default">
          {loading ? 'Keresés...' : 'Keresés'}
        </Button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="font-mono text-xs text-muted-foreground">Betöltés...</div>
      ) : events.length === 0 ? (
        <div className="grid min-h-[300px] place-items-center rounded-sm border border-dashed border-border bg-card/70">
          <p className="font-mono text-xs text-muted-foreground">Nincs találat.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {events.map((ev) => (
            <button
              className="group overflow-hidden rounded-sm border border-border bg-card text-left transition hover:border-swarm-amber/40 hover:shadow-[0_0_20px_rgba(232,165,0,0.1)]"
              key={ev.id}
              onClick={() => setSelected(ev)}
            >
              <div className="relative aspect-video overflow-hidden bg-[#030507]">
                <img alt={ev.label} className="h-full w-full object-cover" src={eventThumbnailUrl(ev.id)} />
              </div>
              <div className="p-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-sm border border-swarm-green/40 bg-swarm-green/10 px-1.5 py-0.5 font-mono text-[10px] text-swarm-green">{ev.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{ev.score != null ? `${Math.round(ev.score * 100)}%` : '—'}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-foreground/70">{getCamDisplay(ev.camera)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{formatEventTime(ev.start_time)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected ? <EventDialog event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
