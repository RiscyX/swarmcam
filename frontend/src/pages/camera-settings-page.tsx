import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PulseDot } from '@/components/ui/pulse-dot'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/use-auth'
import { useBreakpoint } from '@/hooks/use-breakpoint'
import {
  deleteCamera,
  getCameraDisplayName,
  getCameraSettings,
  saveCameraSettings,
  setCameraAlias,
  type CameraSettingsPayload,
} from '@/lib/cameras'
import type { Camera } from '@/types/camera'

type CameraSettingsPageProps = {
  cameras: Camera[]
  onRenameCamera: (name: string, displayName: string) => void
  onDeleteCamera: (name: string) => void
}

type MobileView = 'list' | 'detail'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const ORIENTATIONS = ['0', '90', '180', '270']
const VIDEO_SIZES = ['1920x1080', '1280x720', '854x480', '640x480', '320x240']
const VIDEO_FPS = ['30', '25', '20', '15', '10', '5']

function shortIp(ip: string) {
  const parts = ip.split('.')
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : ip
}

function SelectSetting({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} onChange={(e) => onChange(e.target.value)} value={value}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </div>
  )
}

function ToggleSetting({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-between gap-4">
      <span className="font-mono text-xs text-[var(--fg-secondary)]">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

export function CameraSettingsPage({ cameras, onRenameCamera, onDeleteCamera }: CameraSettingsPageProps) {
  const breakpoint = useBreakpoint()
  const isDesktop = breakpoint === 'desktop'

  const [selectedName, setSelectedName] = useState<string>(cameras[0]?.name ?? '')
  const [mobileView, setMobileView] = useState<MobileView>('list')

  const selectedCamera = cameras.find((c) => c.name === selectedName)

  function handleSelect(name: string) {
    setSelectedName(name)
    if (!isDesktop) setMobileView('detail')
  }

  function handleDeleted(name: string) {
    onDeleteCamera(name)
    const remaining = cameras.filter((c) => c.name !== name)
    if (remaining.length > 0) setSelectedName(remaining[0].name)
  }

  if (!cameras.length) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <p className="font-mono text-xs text-[var(--fg-muted)]">No camera. Run a discovery scan.</p>
      </div>
    )
  }

  if (!isDesktop && mobileView === 'list') {
    return (
      <NodeList
        cameras={cameras}
        mobile
        selectedName={selectedName}
        onSelect={handleSelect}
      />
    )
  }

  return (
    <div className={isDesktop ? 'grid grid-cols-[236px_1fr] gap-5' : undefined}>
      {isDesktop ? (
        <NodeList cameras={cameras} selectedName={selectedName} onSelect={handleSelect} />
      ) : null}
      {selectedCamera ? (
        <DetailPanel
          camera={selectedCamera}
          isMobile={!isDesktop}
          key={selectedCamera.name}
          onBack={() => setMobileView('list')}
          onDelete={() => handleDeleted(selectedCamera.name)}
          onRenameCamera={onRenameCamera}
        />
      ) : null}
    </div>
  )
}

function NodeList({
  cameras,
  selectedName,
  onSelect,
  mobile = false,
}: {
  cameras: Camera[]
  selectedName: string
  onSelect: (name: string) => void
  mobile?: boolean
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Nodes">
      <div className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">Nodes</div>
      {cameras.map((cam) => {
        const active = cam.name === selectedName
        return (
          <button
            className={`flex w-full items-center gap-3 rounded-sm border-l-[3px] px-3 text-left transition-colors ${
              active
                ? 'border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                : 'border-l-transparent hover:bg-[var(--hover-overlay)]'
            } ${mobile ? 'h-[52px]' : 'py-2'}`}
            key={cam.name}
            onClick={() => onSelect(cam.name)}
            type="button"
          >
            <PulseDot animated={cam.online !== false} size={8} tone={cam.online === false ? 'offline' : 'live'} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs font-bold text-[var(--fg)]">
                {getCameraDisplayName(cam)}
              </span>
              {!mobile ? (
                <span className="block font-mono text-[10px] text-[var(--fg-dim)]">{shortIp(cam.ip)}</span>
              ) : null}
            </span>
            {mobile ? (
              <span className="shrink-0 font-mono text-xs text-[var(--fg-dim)]">{shortIp(cam.ip)}</span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

function DetailPanel({
  camera,
  isMobile,
  onBack,
  onRenameCamera,
  onDelete,
}: {
  camera: Camera
  isMobile: boolean
  onBack: () => void
  onRenameCamera: (name: string, displayName: string) => void
  onDelete: () => void
}) {
  const { token } = useAuth()

  const [settings, setSettings] = useState<CameraSettingsPayload | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [appliedFields, setAppliedFields] = useState<string[]>([])
  const [aliasDraft, setAliasDraft] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loading = settings === null && !loadFailed

  // The panel is remounted per selected camera (keyed), so this runs once per camera.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCameraSettings(token, camera.name)
      .then((s) => {
        if (!cancelled) {
          setSettings(s)
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [camera.name, token])

  async function handleSaveAlias() {
    if (!token) return
    setAliasError(null)
    try {
      const result = await setCameraAlias(token, camera.name, aliasDraft)
      onRenameCamera(camera.name, result.display_name)
      setAliasDraft('')
    } catch {
      setAliasError('Could not save alias. Try again.')
    }
  }

  async function handleSaveSettings() {
    if (!token || !settings || loading) return
    setStatus('saving')
    setSaveError(null)
    try {
      const result = await saveCameraSettings(token, camera.name, settings)
      setAppliedFields(result.applied)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
      setSaveError('Saving failed. The camera may be unreachable — try again.')
    }
  }

  async function handleDelete() {
    if (!token) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCamera(token, camera.name)
      onDelete()
    } catch {
      setDeleteError('Delete failed. The node is still configured — try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isMobile ? (
        <Button
          className="h-11 justify-start px-3 font-mono text-xs"
          onClick={onBack}
          variant="ghost"
        >
          ← ALL NODES
        </Button>
      ) : null}

      {/* Header */}
      <div>
        <h2 className="text-[17px] font-bold leading-tight text-[var(--fg)]">{getCameraDisplayName(camera)}</h2>
        <p className="mt-0.5 font-mono text-xs text-[var(--fg-dim)]">{camera.name}</p>
      </div>

      {/* Alias */}
      <section className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <Label htmlFor="cam-alias">Display name</Label>
        <div className="flex gap-2">
          <Input
            className="h-11 flex-1"
            id="cam-alias"
            onChange={(e) => setAliasDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveAlias() }}
            placeholder={getCameraDisplayName(camera)}
            value={aliasDraft}
          />
          <Button
            className="h-11 shrink-0"
            disabled={!aliasDraft.trim()}
            onClick={() => void handleSaveAlias()}
            variant="outline"
          >
            Save
          </Button>
        </div>
        {aliasError ? (
          <p className="mt-2 font-mono text-xs text-[var(--status-error)]" role="alert">{aliasError}</p>
        ) : null}
      </section>

      {/* Android IP Camera settings */}
      <section className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
          Android IP Camera settings
        </div>

        {loading ? (
          <div className="py-8 text-center font-mono text-xs text-[var(--fg-muted)]">Loading…</div>
        ) : loadFailed ? (
          <div className="py-8 text-center font-mono text-xs text-[var(--status-error)]">
            Camera is not available.
          </div>
        ) : settings ? (
          <>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
              <SelectSetting
                id="set-orientation"
                label="Orientation"
                onChange={(v) => setSettings({ ...settings, orientation: v || null })}
                options={ORIENTATIONS}
                value={settings.orientation ?? ''}
              />
              <SelectSetting
                id="set-resolution"
                label="Resolution"
                onChange={(v) => setSettings({ ...settings, video_size: v || null })}
                options={VIDEO_SIZES}
                value={settings.video_size ?? ''}
              />
              <SelectSetting
                id="set-fps"
                label="FPS"
                onChange={(v) => setSettings({ ...settings, video_fps: v === '' ? null : Number(v) })}
                options={VIDEO_FPS}
                value={settings.video_fps != null ? String(settings.video_fps) : ''}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-8 border-t border-[var(--border-row)] pt-4">
              <ToggleSetting
                checked={Boolean(settings.mirror)}
                label="Mirror image"
                onCheckedChange={(v) => setSettings({ ...settings, mirror: v })}
              />
              <ToggleSetting
                checked={settings.camera === 'front'}
                label="Front camera (FFC)"
                onCheckedChange={(v) => setSettings({ ...settings, camera: v ? 'front' : 'back' })}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button disabled={status === 'saving'} onClick={() => void handleSaveSettings()}>
                {status === 'saving' ? 'Saving…' : 'Save settings'}
              </Button>
              {status === 'saved' && appliedFields.length > 0 ? (
                <span className="font-mono text-xs text-[var(--status-live)]">
                  ✓ Applied: {appliedFields.join(', ')}
                </span>
              ) : status === 'saved' ? (
                <span className="font-mono text-xs text-[var(--fg-muted)]">No changes.</span>
              ) : null}
            </div>
            {saveError ? (
              <p className="mt-2 font-mono text-xs text-[var(--status-error)]" role="alert">{saveError}</p>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Danger zone */}
      <section className="rounded-sm border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--status-error)]">
          Danger zone
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-[var(--fg-secondary)]">
            The node is removed from the Frigate config and its alias is deleted.{' '}
            <span className="font-bold text-[var(--fg)]">Recordings are kept.</span>
          </p>
          <Button
            className="shrink-0 border-[var(--danger-border)] text-[var(--status-error)] hover:border-[var(--status-error)] hover:bg-[var(--hover-overlay)] hover:text-[var(--status-error)]"
            onClick={() => {
              setDeleteError(null)
              setConfirmDelete(true)
            }}
            variant="outline"
          >
            Delete node
          </Button>
        </div>
      </section>

      {/* Delete confirmation */}
      <Dialog
        confirmLabel={deleting ? 'Deleting…' : 'Delete node'}
        description={`This removes ${getCameraDisplayName(camera)} and restarts Frigate.`}
        onClose={() => {
          if (deleting) return
          setDeleteError(null)
          setConfirmDelete(false)
        }}
        onConfirm={() => void handleDelete()}
        open={confirmDelete}
        title="Delete node"
        variant="destructive"
      >
        <p className="text-sm text-[var(--fg-secondary)]">
          Are you sure you want to delete{' '}
          <span className="font-mono font-bold text-[var(--fg)]">{getCameraDisplayName(camera)}</span>?
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-xs text-[var(--fg-muted)]">
          <li>Removed from the Frigate config (docker/frigate/config.yml)</li>
          <li>Alias deleted (backend/aliases.json)</li>
          <li>Frigate restarts during the change</li>
          <li>Recordings are kept</li>
        </ul>
        {deleteError ? (
          <p className="mt-3 font-mono text-xs text-[var(--status-error)]" role="alert">{deleteError}</p>
        ) : null}
      </Dialog>
    </div>
  )
}
