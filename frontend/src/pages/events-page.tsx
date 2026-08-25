import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { getCameraDisplayName } from '@/lib/cameras'
import {
  type EventFilters,
  type FrigateEvent,
  deleteRecordingEvent,
  eventThumbnailUrl,
  fireEventSnapshotUrl,
  formatEventTime,
  getEvents,
  getFireEvents,
  recordingClipUrl,
} from '@/lib/events'
import type { Camera } from '@/types/camera'

const LABELS = ['person', 'car', 'dog', 'cat', 'bird', 'motorcycle', 'bicycle', 'fire', 'smoke']

type UIEvent = FrigateEvent & { is_fire?: boolean }

type EventsPageProps = {
  cameras: Camera[]
}

const THUMB_FILTER = '[filter:grayscale(1)_contrast(1.08)]'

function snapshotUrl(event: UIEvent): string {
  return event.is_fire ? fireEventSnapshotUrl(event.id) : eventThumbnailUrl(event.id)
}

function scoreLabel(event: UIEvent): string {
  return event.score != null ? `${Math.round(event.score * 100)}%` : '—'
}

function EventImage({ event, className }: { event: UIEvent; className?: string }) {
  if (event.is_fire && !event.has_snapshot) {
    return (
      <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
        No img
      </div>
    )
  }
  return <img alt={event.label} className={className} loading="lazy" src={snapshotUrl(event)} />
}

export function EventsPage({ cameras }: EventsPageProps) {
  const { token } = useAuth()
  const [filters, setFilters] = useState<EventFilters>({ limit: 50 })
  const [events, setEvents] = useState<UIEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<UIEvent | null>(null)
  const [pendingDelete, setPendingDelete] = useState<UIEvent | null>(null)
  const [deleting, setDeleting] = useState(false)
  const didLoad = useRef(false)

  async function load(f: EventFilters = filters) {
    if (!token) return
    setLoading(true)
    try {
      const [fEvents, fireRes] = await Promise.all([
        getEvents(token, f),
        getFireEvents(token, f).catch(() => [])
      ])
      const mappedFire: UIEvent[] = fireRes.map(fe => ({
        id: fe.id,
        camera: fe.camera,
        label: fe.label,
        score: fe.score,
        start_time: fe.timestamp,
        end_time: fe.timestamp,
        has_snapshot: fe.has_snapshot,
        has_clip: false,
        is_fire: true
      }))
      const all = [...fEvents, ...mappedFire].sort((a, b) => b.start_time - a.start_time)
      setEvents(all.slice(0, f.limit || 50))
    }
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

  async function handleDelete() {
    if (!token || !pendingDelete || deleting) return
    setDeleting(true)
    try {
      await deleteRecordingEvent(token, pendingDelete.id)
      setPendingDelete(null)
      setSelected(null)
      await load()
    }
    catch { setPendingDelete(null) }
    finally { setDeleting(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)] p-3">
        <div className="min-w-[150px] flex-1">
          <Label htmlFor="events-filter-camera">Camera</Label>
          <Select
            id="events-filter-camera"
            onChange={(e) => setFilter('camera', e.target.value)}
            value={filters.camera ?? ''}
          >
            <option value="">All cameras</option>
            {cameras.map((c) => <option key={c.name} value={c.name}>{getCameraDisplayName(c)}</option>)}
          </Select>
        </div>
        <div className="min-w-[150px] flex-1">
          <Label htmlFor="events-filter-object">Object</Label>
          <Select
            id="events-filter-object"
            onChange={(e) => setFilter('label', e.target.value)}
            value={filters.label ?? ''}
          >
            <option value="">All objects</option>
            {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </div>
        <div className="min-w-[130px] flex-1">
          <Label htmlFor="events-filter-limit">Limit</Label>
          <Select
            id="events-filter-limit"
            onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value) }))}
            value={filters.limit ?? 50}
          >
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} results</option>)}
          </Select>
        </div>
        <Button disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Search'}
        </Button>
      </div>

      {/* Loading */}
      {loading && events.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton className="h-[67px] w-full" key={i} />)}
        </div>
      ) : !loading && events.length === 0 ? (
        <EmptyState description="Adjust the filters above and search again." title="No events found" />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="hidden overflow-hidden rounded-sm border border-[var(--border-raised)] md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[104px]">Snapshot</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Camera</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow className="cursor-pointer" key={ev.id} onClick={() => setSelected(ev)}>
                    <TableCell variant="thumb">
                      <EventImage className={`h-full w-full object-cover ${THUMB_FILTER}`} event={ev} />
                    </TableCell>
                    <TableCell variant="mono">{formatEventTime(ev.start_time)}</TableCell>
                    <TableCell variant="text">{getCamDisplay(ev.camera)}</TableCell>
                    <TableCell variant="badge">{ev.label}</TableCell>
                    <TableCell variant="mono">{scoreLabel(ev)}</TableCell>
                    <TableCell variant="actions">
                      <Button onClick={(e) => { e.stopPropagation(); setSelected(ev) }} size="sm" variant="outline">
                        View
                      </Button>
                      <Button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(ev) }}
                        size="sm"
                        variant="destructive"
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile — cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {events.map((ev) => (
              <div
                className="overflow-hidden rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)]"
                key={ev.id}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  onClick={() => setSelected(ev)}
                  type="button"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">
                    {ev.label} · {getCamDisplay(ev.camera)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]">
                    {formatEventTime(ev.start_time)}
                  </span>
                </button>
                <div className="grid grid-cols-2 gap-px border-t border-[var(--border-row)] bg-[var(--border-row)]">
                  <div className="bg-[var(--bg-surface)] px-3 py-2">
                    <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">Score</div>
                    <div className="font-mono text-xs text-[var(--fg-secondary)]">{scoreLabel(ev)}</div>
                  </div>
                  <div className="bg-[var(--bg-surface)] px-3 py-2">
                    <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">Zone</div>
                    <div className="font-mono text-xs text-[var(--fg-secondary)]">—</div>
                  </div>
                </div>
                <div className="border-t border-[var(--border-row)] p-2">
                  <Button className="w-full" onClick={() => setSelected(ev)} size="sm" variant="outline">
                    View snapshot
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* View dialog */}
      <Dialog
        confirmLabel="Open clip"
        description={`Camera ${getCamDisplay(selected?.camera ?? '')}`}
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (selected?.has_clip) window.open(recordingClipUrl(selected.id), '_blank', 'noopener')
        }}
        open={Boolean(selected)}
        title={selected?.label ?? ''}
      >
        {selected ? (
          <>
            {selected.is_fire && !selected.has_snapshot ? (
              <EmptyState className="border-0" description="This fire event has no stored snapshot." title="No image available" />
            ) : (
              <div className="-mx-5 -mt-4 border-b border-[var(--border-row)] bg-black">
                <EventImage
                  className="aspect-video w-full object-contain"
                  event={selected}
                />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-[var(--fg-muted)]">
              <span>TIME&nbsp;&nbsp;{formatEventTime(selected.start_time)}</span>
              <span>SCORE&nbsp;&nbsp;{scoreLabel(selected)}</span>
              <span>CAMERA&nbsp;&nbsp;{getCamDisplay(selected.camera)}</span>
            </div>
          </>
        ) : null}
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        cancelLabel="Cancel"
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        description="The snapshot AND the clip will be permanently deleted from Frigate. This cannot be undone."
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
        open={Boolean(pendingDelete)}
        title="Delete event"
        variant="destructive"
      >
        {pendingDelete ? (
          <p className="text-sm text-[var(--fg-secondary)]">
            {pendingDelete.label} · {getCamDisplay(pendingDelete.camera)} ·{' '}
            <span className="font-mono text-xs text-[var(--fg-muted)]">{formatEventTime(pendingDelete.start_time)}</span>
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
