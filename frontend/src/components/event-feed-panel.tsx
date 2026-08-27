import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { Dialog } from '@/components/ui/dialog'
import { PulseDot } from '@/components/ui/pulse-dot'
import { apiUrl } from '@/lib/api'
import { getCameraDisplayName } from '@/lib/cameras'
import type { Camera } from '@/types/camera'
import type { FrigateLiveEvent } from '@/types/events'

type EventFeedPanelProps = {
  cameras: Camera[]
  events: FrigateLiveEvent[]
  onClose: () => void
  onClear: () => void
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000))
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

export function EventFeedPanel({ cameras, events, onClose, onClear }: EventFeedPanelProps) {
  const [now, setNow] = useState(() => Date.now())
  const [selected, setSelected] = useState<FrigateLiveEvent | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  function getDisplayName(cameraName: string | null | undefined) {
    if (!cameraName) return '—'
    const cam = cameras.find((c) => c.name === cameraName)
    return cam ? getCameraDisplayName(cam) : cameraName
  }

  const selectedLabel = selected?.label ?? 'Event'

  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-[52] flex max-h-[70%] flex-col overflow-hidden border-t-2 border-t-[var(--accent)] bg-[var(--bg-surface)] text-[var(--fg)] shadow-[0_-12px_28px_var(--shadow-panel)] animate-in slide-in-from-bottom fade-in duration-200 md:inset-y-0 md:left-auto md:right-0 md:z-[45] md:max-h-none md:w-[312px] md:border-l-2 md:border-l-[var(--accent)] md:border-t-0 md:shadow-[-12px_0_28px_var(--shadow-panel)] md:slide-in-from-bottom-0"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border-row)] px-3">
        <PulseDot size={7} speed={1.6} tone="accent" />
        <span className="font-ui text-xs font-bold uppercase tracking-[0.16em]">Live Events</span>
        {events.length > 0 ? (
          <button
            className="ml-auto font-mono text-[10px] text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        ) : null}
        <button
          aria-label="Close event feed"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)] ${
            events.length > 0 ? '' : 'ml-auto'
          }`}
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <p className="font-mono text-[10px] text-[var(--fg-muted)]">Waiting for Frigate events...</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-row)]">
            {events.map((ev) => (
              <li key={`${ev.id ?? ''}-${ev.receivedAt}`}>
                <button
                  className="flex min-h-[44px] w-full items-center gap-2.5 p-2.5 text-left transition-colors hover:bg-[var(--hover-overlay)]"
                  onClick={() => setSelected(ev)}
                  type="button"
                >
                  {ev.id ? (
                    <img
                      alt=""
                      className="h-[34px] w-[56px] shrink-0 rounded-sm object-cover"
                      src={apiUrl(`/api/events/${ev.id}/thumbnail`)}
                    />
                  ) : (
                    <div className="h-[34px] w-[56px] shrink-0 rounded-sm bg-[var(--bg-tile)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold">
                      {ev.label ?? '—'} · {getDisplayName(ev.camera)}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[var(--fg-muted)]">
                      {relativeTime(ev.receivedAt, now)}
                      {ev.score != null ? ` · ${Math.round(ev.score * 100)}%` : ''}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        cancelLabel="Close"
        confirmLabel="OK"
        description={selected ? `${getDisplayName(selected.camera)} · ${relativeTime(selected.receivedAt, now)} ago` : undefined}
        onClose={() => setSelected(null)}
        onConfirm={() => setSelected(null)}
        open={selected !== null}
        title={selectedLabel.toUpperCase()}
      >
        {selected ? (
          <div className="-mx-5 -mt-4">
            {selected.id ? (
              <img
                alt=""
                className="w-full bg-black object-contain"
                src={apiUrl(`/api/events/${selected.id}/thumbnail`)}
              />
            ) : null}
            <dl className="space-y-1 px-5 py-4 font-mono text-xs">
              {selected.camera ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--fg-muted)]">CAMERA</dt>
                  <dd className="truncate">{getDisplayName(selected.camera)}</dd>
                </div>
              ) : null}
              {selected.label ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--fg-muted)]">OBJECT</dt>
                  <dd>{selected.label}</dd>
                </div>
              ) : null}
              {selected.score != null ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--fg-muted)]">SCORE</dt>
                  <dd>{Math.round(selected.score * 100)}%</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--fg-muted)]">RECEIVED</dt>
                <dd>{new Date(selected.receivedAt).toLocaleTimeString()}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>
    </aside>
  )
}
