import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { getCameraDisplayName } from '@/lib/cameras'
import { type EventFilters, type FrigateEvent, eventThumbnailUrl, formatEventTime, getEvents } from '@/lib/events'
import type { Camera } from '@/types/camera'

const LABELS = ['person', 'car', 'dog', 'cat', 'bird', 'motorcycle', 'bicycle', 'fire', 'smoke']

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded border border-border" onClick={(e) => e.stopPropagation()}>
        <img alt={event.label} className="block max-h-[85vh] w-auto" src={eventThumbnailUrl(event.id)} />
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/80 px-4 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            {event.label} · {event.camera} · {formatEventTime(event.start_time)}
            {event.score != null ? ` · ${Math.round(event.score * 100)}%` : ''}
          </span>
          <Button onClick={onClose} size="sm" variant="outline">Close</Button>
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
    try { setEvents(await getEvents(token, f)) }
    catch { setEvents([]) }
    finally { setLoading(false) }
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
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <select
          className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onChange={(e) => setFilter('camera', e.target.value)}
          value={filters.camera ?? ''}
        >
          <option value="">All cameras</option>
          {cameras.map((c) => <option key={c.name} value={c.name}>{getCameraDisplayName(c)}</option>)}
        </select>
        <select
          className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onChange={(e) => setFilter('label', e.target.value)}
          value={filters.label ?? ''}
        >
          <option value="">All objects</option>
          {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value) }))}
          value={filters.limit ?? 50}
        >
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} results</option>)}
        </select>
        <Button className="h-8" disabled={loading} onClick={() => void load()} size="sm">
          {loading ? 'Loading...' : 'Search'}
        </Button>
      </div>

      {/* Table */}
      {!loading && events.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-sm text-muted-foreground">No events found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-xs text-muted-foreground">
                <th className="w-[100px] px-3 py-2.5 font-medium">Snapshot</th>
                <th className="px-3 py-2.5 font-medium">Camera</th>
                <th className="px-3 py-2.5 font-medium">Object</th>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr
                  className="cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:bg-white/[0.03]"
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                >
                  <td className="px-3 py-2">
                    <div className="h-12 w-[85px] overflow-hidden rounded bg-black">
                      <img alt={ev.label} className="h-full w-full object-cover" src={eventThumbnailUrl(ev.id)} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-foreground">{getCamDisplay(ev.camera)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{ev.label}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{formatEventTime(ev.start_time)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {ev.score != null ? `${Math.round(ev.score * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? <EventDialog event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
