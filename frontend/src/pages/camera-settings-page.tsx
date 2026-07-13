import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { deleteCamera, getCameraDisplayName, getCameraSettings, saveCameraSettings, setCameraAlias, type CameraSettingsPayload } from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type CameraSettingsPageProps = {
  cameras: Camera[]
  onRenameCamera: (name: string, displayName: string) => void
  onDeleteCamera: (name: string) => void
}

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

const ORIENTATIONS = ['landscape', 'portrait', 'landscape_flipped', 'portrait_flipped']
const VIDEO_SIZES = ['1920x1080', '1280x720', '854x480', '640x480', '320x240']
const MIRROR_FLIP = ['none', 'flip', 'mirror', 'both']

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string | null | undefined
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <select
        className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        onChange={(e) => onChange(e.target.value)}
        value={value ?? ''}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}



export function CameraSettingsPage({ cameras, onRenameCamera, onDeleteCamera }: CameraSettingsPageProps) {
  const { token } = useAuth()
  const [selectedName, setSelectedName] = useState<string>(cameras[0]?.name ?? '')
  const [settings, setSettings] = useState<CameraSettingsPayload>({})
  const [alias, setAlias] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [appliedFields, setAppliedFields] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedCamera = cameras.find((c) => c.name === selectedName)

  // Load settings only when selected camera or token changes — NOT when cameras prop
  // updates (WebSocket health push every 5s), which would reset user's changes.
  useEffect(() => {
    if (!selectedName || !token) return
    setStatus('loading')
    setAppliedFields([])
    getCameraSettings(token, selectedName)
      .then((s) => { setSettings(s); setStatus('idle') })
      .catch(() => setStatus('error'))
  }, [selectedName, token])

  // Sync alias display when cameras list changes (display name may have been updated)
  useEffect(() => {
    const cam = cameras.find((c) => c.name === selectedName)
    if (cam) setAlias(cam.display_name ?? '')
  }, [selectedName, cameras])

  async function handleSaveSettings() {
    if (!token) return
    setStatus('saving')
    try {
      const result = await saveCameraSettings(token, selectedName, settings)
      setAppliedFields(result.applied)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
    }
  }

  async function handleSaveAlias() {
    if (!token) return
    try {
      const result = await setCameraAlias(token, selectedName, alias)
      onRenameCamera(selectedName, result.display_name)
      setAlias(result.display_name)
    } catch {
      // silently fail
    }
  }

  async function handleDeleteCamera() {
    if (!token) return
    setDeleting(true)
    try {
      await deleteCamera(token, selectedName)
      onDeleteCamera(selectedName)
    } catch {
      // silently fail
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (!cameras.length) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-border bg-card/70 p-8 text-center">
        <p className="font-mono text-xs text-muted-foreground">Nincs kamera. Futtass discovery scan-t.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      {/* Camera selector */}
      <div className="flex flex-col gap-1">
        {cameras.map((cam) => (
          <button
            className={`rounded-sm border px-3 py-2.5 text-left font-mono text-xs transition ${
              cam.name === selectedName
                ? 'border-swarm-blue/50 bg-swarm-blue/10 text-swarm-blue'
                : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
            }`}
            key={cam.name}
            onClick={() => setSelectedName(cam.name)}
          >
            <div className="font-bold">{getCameraDisplayName(cam)}</div>
            <div className="mt-0.5 opacity-60">{cam.ip}:{cam.port}</div>
          </button>
        ))}
      </div>

      {/* Settings panel */}
      <div className="flex flex-col gap-4">
        {/* Alias */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="mb-3 mb-3 text-xs font-medium text-muted-foreground">Megjelenítési név</div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveAlias() }}
              placeholder={selectedCamera ? getCameraDisplayName(selectedCamera) : ''}
              value={alias}
            />
            <Button onClick={() => void handleSaveAlias()} size="sm" variant="outline">
              Mentés
            </Button>
          </div>
        </div>

        {/* IP Webcam settings */}
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="mb-1 mb-3 text-xs font-medium text-muted-foreground">IP Webcam beállítások</div>

          {status === 'loading' ? (
            <div className="py-8 text-center font-mono text-xs text-muted-foreground">Betöltés...</div>
          ) : status === 'error' ? (
            <div className="py-8 text-center font-mono text-xs text-swarm-red">A kamera nem elérhető.</div>
          ) : (
            <>
              <SelectField
                label="Orientáció"
                onChange={(v) => setSettings((s) => ({ ...s, orientation: v || null }))}
                options={ORIENTATIONS}
                value={settings.orientation}
              />
              <SelectField
                label="Felbontás"
                onChange={(v) => setSettings((s) => ({ ...s, video_size: v || null }))}
                options={VIDEO_SIZES}
                value={settings.video_size}
              />
              <SelectField
                label="Tükrözés"
                onChange={(v) => setSettings((s) => ({ ...s, mirror_flip: v || null }))}
                options={MIRROR_FLIP}
                value={settings.mirror_flip}
              />
              <SelectField
                label="Előlapi kamera (FFC)"
                onChange={(v) => setSettings((s) => ({ ...s, ffc: v || null }))}
                options={['off', 'on']}
                value={settings.ffc}
              />

              <div className="mt-4 flex items-center gap-3">
                <Button disabled={status === 'saving'} onClick={() => void handleSaveSettings()} variant="default">
                  {status === 'saving' ? 'Mentés...' : 'Beállítások mentése'}
                </Button>
                {status === 'saved' && appliedFields.length > 0 ? (
                  <span className="font-mono text-xs text-swarm-green">
                    ✓ Alkalmazva: {appliedFields.join(', ')}
                  </span>
                ) : status === 'saved' ? (
                  <span className="font-mono text-xs text-muted-foreground">Nincs változás.</span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Delete camera */}
        <div className="rounded-sm border border-swarm-red/20 bg-card p-4">
          <div className="mb-2 text-xs font-medium text-swarm-red/70">Danger zone</div>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-muted-foreground">
              Eltávolítja a kamerát a Frigate konfigból és újraindítja a Frigate-t.
            </p>
            <Button
              className="ml-4 shrink-0 border-swarm-red/40 text-swarm-red hover:border-swarm-red"
              disabled={deleting}
              onClick={() => setConfirmDelete(true)}
              size="sm"
              variant="outline"
            >
              Kamera törlése
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-sm border border-border bg-card p-6 text-center">
            <p className="font-mono text-sm text-foreground">
              Biztosan törlöd: <strong>{selectedCamera ? getCameraDisplayName(selectedCamera) : selectedName}</strong>?
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Frigate újraindul, a felvételek megmaradnak.</p>
            <div className="mt-4 flex justify-center gap-3">
              <Button disabled={deleting} onClick={() => void handleDeleteCamera()} variant="destructive">
                {deleting ? 'Törlés...' : 'Törlés'}
              </Button>
              <Button onClick={() => setConfirmDelete(false)} variant="outline">Mégse</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
