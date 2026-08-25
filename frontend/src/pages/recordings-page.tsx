import { useEffect, useRef, useState } from 'react'
import { Film } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { getCameraDisplayName } from '@/lib/cameras'
import { type FrigateEvent, deleteRecordingEvent, formatDuration, formatEventTime, getRecordingEvents, recordingClipUrl } from '@/lib/events'
import type { Camera } from '@/types/camera'

type RecordingsPageProps = {
  cameras: Camera[]
}

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

function rangeAfter(range: string): number | undefined {
  if (range === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return Math.floor(start.getTime() / 1000)
  }
  if (range === '7d') return Math.floor(Date.now() / 1000) - 7 * 86400
  if (range === '30d') return Math.floor(Date.now() / 1000) - 30 * 86400
  return undefined
}

function formatTimeOnly(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function downloadClip(eventId: string) {
  const anchor = document.createElement('a')
  anchor.href = recordingClipUrl(eventId)
  anchor.download = ''
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function RecordingsPage({ cameras }: RecordingsPageProps) {
  const { token } = useAuth()
  const [camera, setCamera] = useState('')
  const [range, setRange] = useState('today')
  const [events, setEvents] = useState<FrigateEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<FrigateEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FrigateEvent | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [realDuration, setRealDuration] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const didLoad = useRef(false)

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      const filters = { limit: 50, after: rangeAfter(range), ...(camera ? { camera } : {}) }
      setEvents(await getRecordingEvents(token, filters))
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  function openPlayer(ev: FrigateEvent) {
    setVideoError(false)
    setRealDuration(null)
    setSelected(ev)
  }

  function closePlayer() {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    setSelected(null)
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    try {
      await deleteRecordingEvent(token, deleteTarget.id)
      setEvents((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      if (selected?.id === deleteTarget.id) closePlayer()
      setDeleteTarget(null)
    } catch {
      window.alert('Failed to delete recording. Please try again later.')
    }
  }

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true
      void load()
    }
  })

  function getCamDisplay(name: string) {
    const cam = cameras.find((c) => c.name === name)
    return cam ? getCameraDisplayName(cam) : name
  }

  function clipLength(ev: FrigateEvent) {
    return realDuration !== null && selected?.id === ev.id ? formatDuration(0, realDuration) : formatDuration(ev.start_time, ev.end_time)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] pb-3">
        <div className="w-full sm:w-52">
          <Label htmlFor="recordings-camera">Camera</Label>
          <Select id="recordings-camera" onChange={(e) => setCamera(e.target.value)} value={camera}>
            <option value="">All cameras</option>
            {cameras.map((c) => (
              <option key={c.name} value={c.name}>{getCameraDisplayName(c)}</option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Label htmlFor="recordings-range">Range</Label>
          <Select id="recordings-range" onChange={(e) => setRange(e.target.value)} value={range}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </div>
        <Button disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading...' : 'Search'}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton className="h-14 w-full" key={i} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          description="Adjust the camera or range filters and search again."
          icon={<Film className="h-8 w-8" />}
          title="No recordings found"
        />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="overflow-hidden rounded-sm border border-[var(--border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Camera</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow className="cursor-pointer" key={ev.id} onClick={() => openPlayer(ev)}>
                    <TableCell>{getCamDisplay(ev.camera)}</TableCell>
                    <TableCell variant="mono">{formatEventTime(ev.start_time)}</TableCell>
                    <TableCell variant="mono">{formatDuration(ev.start_time, ev.end_time)}</TableCell>
                    <TableCell variant="mono">—</TableCell>
                    <TableCell variant="actions">
                      <Button onClick={(e) => { e.stopPropagation(); openPlayer(ev) }} size="sm" variant="outline">
                        Play
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a download href={recordingClipUrl(ev.id)} onClick={(e) => e.stopPropagation()}>
                          Download
                        </a>
                      </Button>
                      <Button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(ev) }}
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
          <div className="flex flex-col gap-3 md:hidden">
            {events.map((ev) => (
              <div className="overflow-hidden rounded-sm border border-[var(--border-row)] bg-[var(--bg-surface)]" key={ev.id}>
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border-row)] px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--status-live)]" />
                    <span className="truncate text-sm font-bold text-[var(--fg)]">{getCamDisplay(ev.camera)}</span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-[var(--fg-muted)]">{formatDuration(ev.start_time, ev.end_time)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">Start</div>
                    <div className="font-mono text-xs text-[var(--fg-secondary)]">{formatTimeOnly(ev.start_time)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">Size</div>
                    <div className="font-mono text-xs text-[var(--fg-secondary)]">—</div>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <Button className="w-full" onClick={() => openPlayer(ev)}>
                    Play
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Player dialog */}
      <Dialog
        cancelLabel="Close"
        confirmLabel="Download"
        onClose={closePlayer}
        onConfirm={() => selected && downloadClip(selected.id)}
        open={selected !== null}
        title={selected ? getCamDisplay(selected.camera) : 'Recording'}
      >
        {selected ? (
          <>
            <div className="-mx-5 -mt-4">
              {videoError ? (
                <div className="flex aspect-video w-full items-center justify-center bg-black px-6 text-center font-mono text-xs text-[var(--fg-muted)]">
                  No recording available for this event.
                </div>
              ) : (
                <video
                  autoPlay
                  className="block aspect-video w-full bg-black"
                  controls
                  onError={() => setVideoError(true)}
                  onLoadedMetadata={() => {
                    if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
                      setRealDuration(videoRef.current.duration)
                    }
                  }}
                  ref={videoRef}
                  src={recordingClipUrl(selected.id)}
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-[var(--fg-muted)]">
              <span>START {formatEventTime(selected.start_time)}</span>
              <span>LENGTH {clipLength(selected)}</span>
              <span>SIZE —</span>
            </div>
          </>
        ) : null}
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        confirmLabel="Delete"
        description={deleteTarget ? `${getCamDisplay(deleteTarget.camera)} · ${formatEventTime(deleteTarget.start_time)}` : undefined}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        open={deleteTarget !== null}
        title="Delete recording"
        variant="destructive"
      >
        {deleteTarget ? (
          <p className="text-sm text-[var(--fg-secondary)]">
            This permanently removes the recording from <span className="font-bold text-[var(--fg)]">{getCamDisplay(deleteTarget.camera)}</span> started
            at <span className="font-mono text-[var(--fg)]">{formatEventTime(deleteTarget.start_time)}</span> (size{' '}
            <span className="font-mono text-[var(--fg)]">—</span>). This action cannot be undone.
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
