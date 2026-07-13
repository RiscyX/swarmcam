import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { getCameraDisplayName } from '@/lib/cameras'
import { type EventFilters, type FrigateEvent, deleteRecordingEvent, eventThumbnailUrl, formatDuration, formatEventTime, getRecordingEvents, recordingClipUrl } from '@/lib/events'
import type { Camera } from '@/types/camera'

const LABELS = ['person', 'car', 'dog', 'cat', 'bird', 'motorcycle', 'bicycle', 'fire', 'smoke']

type RecordingsPageProps = {
  cameras: Camera[]
}

function ClipDialog({ event, onClose }: { event: FrigateEvent; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleClose() {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={handleClose}>
      <div className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded border border-border" onClick={(e) => e.stopPropagation()}>
        <video autoPlay className="block max-h-[80vh] w-auto" controls ref={videoRef} src={recordingClipUrl(event.id)} />
        <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            {event.label} · {event.camera} · {formatEventTime(event.start_time)} · {formatDuration(event.start_time, event.end_time)}
          </span>
          <div className="flex gap-2">
            <a
              className="inline-flex h-7 items-center rounded border border-border px-3 font-mono text-xs text-foreground hover:bg-white/5"
              download
              href={recordingClipUrl(event.id)}
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
            <Button onClick={handleClose} size="sm" variant="outline">Close</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RecordingsPage({ cameras }: RecordingsPageProps) {
  const { token } = useAuth()
  const [filters, setFilters] = useState<EventFilters>({ limit: 50 })
  const [events, setEvents] = useState<FrigateEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<FrigateEvent | null>(null)
  const didLoad = useRef(false)

  async function load(f: EventFilters = filters) {
    if (!token) return
    setLoading(true)
    try { setEvents(await getRecordingEvents(token, f)) }
    catch { setEvents([]) }
    finally { setLoading(false) }
  }

  async function handleDelete(ev: FrigateEvent, e: React.MouseEvent) {
    e.stopPropagation()
    if (!token) return
    if (!window.confirm('Are you sure you want to delete this recording?')) return
    
    try {
      await deleteRecordingEvent(token, ev.id)
      setEvents((prev) => prev.filter((item) => item.id !== ev.id))
      if (selected?.id === ev.id) setSelected(null)
    } catch (err) {
      window.alert('Failed to delete recording. Please try again later.')
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
        {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
      </div>

      {/* Table */}
      {!loading && events.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-sm text-muted-foreground">No recordings found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-xs text-muted-foreground">
                <th className="w-[100px] px-3 py-2.5 font-medium">Clip</th>
                <th className="px-3 py-2.5 font-medium">Camera</th>
                <th className="px-3 py-2.5 font-medium">Object</th>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Duration</th>
                <th className="w-8 px-3 py-2.5" />
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
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{formatDuration(ev.start_time, ev.end_time)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                        onClick={(e) => void handleDelete(ev, e)}
                        title="Delete recording"
                      >
                        Delete
                      </button>
                      <span className="text-xs text-muted-foreground">▶</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? <ClipDialog event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
