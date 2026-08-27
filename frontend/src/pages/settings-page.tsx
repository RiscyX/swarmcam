import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { getConfig, getSystemInfo, saveConfig, type ConfigSettings, type DecoderType, type SystemInfo } from '@/lib/config'

const objectOptions = ['person', 'car', 'cat', 'dog', 'bicycle', 'motorcycle']
const decoderOptions: DecoderType[] = ['cpu', 'nvidia', 'intel', 'coral']
const resolutionOptions = [
  { label: '640x360', width: 640, height: 360 },
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
]

const emptyConfig: ConfigSettings = {
  decoder: 'cpu',
  detection_fps: 5,
  detection_width: 1920,
  detection_height: 1080,
  rtsp_transport: 'tcp',
  record_motion_days: 7,
  record_event_days: 14,
  objects: ['person', 'car'],
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string }

function decoderDisabled(decoder: DecoderType, system: SystemInfo | null) {
  if (!system) return false
  if (decoder === 'nvidia') return !system.nvidia_gpu && !system.nvidia_docker
  if (decoder === 'intel') return !system.intel_gpu
  return false
}

function GroupCard({ name, path, children }: { name: string; path: string; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-[var(--border)] bg-[var(--bg-surface)]">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border-row)] px-4 py-2.5">
        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">{name}</h3>
        <code className="font-mono text-[10px] text-[var(--fg-dim)]">{path}</code>
      </header>
      <div className="flex flex-col gap-5 p-4">{children}</div>
    </section>
  )
}

function SettingRow({ label, hint, control }: { label: string; hint: string; control: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight text-[var(--fg)]">{label}</p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--fg-muted)]">{hint}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function Chip({
  checked,
  disabled,
  label,
  name,
  onSelect,
  type,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  name?: string
  onSelect: () => void
  type: 'radio' | 'checkbox'
}) {
  return (
    <label
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 font-mono text-xs transition-colors ${
        checked
          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent-text)]'
          : 'border-[var(--border)] text-[var(--fg-secondary)] hover:border-[var(--fg-muted)]'
      } has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40`}
    >
      <input
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onSelect}
        type={type}
        className="sr-only"
      />
      {label}
    </label>
  )
}

export function SettingsPage() {
  const { token } = useAuth()
  const [config, setConfig] = useState<ConfigSettings>(emptyConfig)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void Promise.all([getConfig(token), getSystemInfo(token)])
      .then(([nextConfig, nextSystem]) => {
        if (!cancelled) {
          setConfig(nextConfig)
          setSystem(nextSystem)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, reloadKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    setSaveState({ kind: 'saving' })
    try {
      const result = await saveConfig(token, config)
      if (result.decoder_changed) {
        setSaveState({
          kind: 'saved',
          message: 'Saved — decoder changed, the Frigate container is being recreated.',
        })
      } else if (result.frigate_restarted) {
        setSaveState({
          kind: 'saved',
          message: 'Saved — Frigate is restarting, live streams may drop for a few seconds.',
        })
      } else {
        setSaveState({
          kind: 'saved',
          message: 'Saved — Frigate is not running, the config applies on next startup.',
        })
      }
    } catch (error) {
      setSaveState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to save the config — try again.',
      })
    }
  }

  function updateConfig(patch: Partial<ConfigSettings>) {
    setConfig((current) => ({ ...current, ...patch }))
  }

  function toggleObject(object: string, checked: boolean) {
    setConfig((current) => ({
      ...current,
      objects: checked ? [...new Set([...current.objects, object])] : current.objects.filter((item) => item !== object),
    }))
  }

  if (loadFailed) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-sm border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <div>
          <p className="font-mono text-xs text-[var(--status-error)]" role="alert">
            Could not load the Frigate config.
          </p>
            <Button
              className="mt-4"
              onClick={() => {
                setLoadFailed(false)
                setReloadKey((key) => key + 1)
              }}
              variant="outline"
            >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form className="mx-auto flex w-full max-w-5xl flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--fg)]">Settings</h2>
        <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted)]">Global Frigate configuration — docker/frigate/config.yml</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupCard name="Decoder" path="ffmpeg.hwaccel_args">
          <SettingRow
            control={
              <Select
                aria-label="Hardware acceleration"
                className="w-full sm:w-44"
                onChange={(event) => updateConfig({ decoder: event.target.value as DecoderType })}
                value={config.decoder}
              >
                {decoderOptions.map((decoder) => (
                  <option disabled={decoderDisabled(decoder, system)} key={decoder} value={decoder}>
                    {decoder}
                  </option>
                ))}
              </Select>
            }
            hint="GPU decoding lowers CPU load. Unavailable accelerators are disabled automatically."
            label="Hardware acceleration"
          />
          <SettingRow
            control={
              <div className="flex gap-2" role="radiogroup" aria-label="RTSP transport">
                {(['tcp', 'udp'] as const).map((transport) => (
                  <Chip
                    checked={config.rtsp_transport === transport}
                    key={transport}
                    label={transport.toUpperCase()}
                    name="rtsp_transport"
                    onSelect={() => updateConfig({ rtsp_transport: transport })}
                    type="radio"
                  />
                ))}
              </div>
            }
            hint="TCP survives Wi-Fi drops better; UDP can be lower latency on stable wired links."
            label="RTSP transport"
          />
        </GroupCard>

        <GroupCard name="Detection" path="detect">
          <SettingRow
            control={
              <Input
                aria-label="Detect FPS"
                className="h-11 w-full sm:w-24"
                min={1}
                onChange={(event) => updateConfig({ detection_fps: Number(event.target.value) })}
                type="number"
                value={config.detection_fps}
              />
            }
            hint="Higher FPS catches fast motion but costs CPU on every node."
            label="Detect FPS"
          />
          <SettingRow
            control={
              <Select
                aria-label="Detect resolution"
                className="w-full sm:w-44"
                onChange={(event) => {
                  const [detection_width, detection_height] = event.target.value.split('x').map(Number)
                  updateConfig({ detection_width, detection_height })
                }}
                value={`${config.detection_width}x${config.detection_height}`}
              >
                {resolutionOptions.map((resolution) => (
                  <option key={resolution.label} value={resolution.label}>
                    {resolution.label}
                  </option>
                ))}
              </Select>
            }
            hint="Detection runs on scaled-down frames; full resolution is kept for recording."
            label="Detect resolution"
          />
          <div>
            <p className="text-[13px] font-semibold leading-tight text-[var(--fg)]">Tracked objects</p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--fg-muted)]">
              Only selected types generate events and clips — fewer objects means less noise.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {objectOptions.map((object) => (
                <Chip
                  checked={config.objects.includes(object)}
                  key={object}
                  label={object}
                  onSelect={() => toggleObject(object, !config.objects.includes(object))}
                  type="checkbox"
                />
              ))}
            </div>
          </div>
        </GroupCard>

        <GroupCard name="Retention" path="record.retain">
          <SettingRow
            control={
              <Input
                aria-label="Clip retention in days"
                className="h-11 w-full sm:w-24"
                min={1}
                onChange={(event) => updateConfig({ record_event_days: Number(event.target.value) })}
                type="number"
                value={config.record_event_days}
              />
            }
            hint="How long event clips stay on disk before automatic cleanup."
            label="Clips (days)"
          />
          <SettingRow
            control={
              <Input
                aria-label="Continuous recording retention in days"
                className="h-11 w-full sm:w-24"
                min={1}
                onChange={(event) => updateConfig({ record_motion_days: Number(event.target.value) })}
                type="number"
                value={config.record_motion_days}
              />
            }
            hint="How long motion-triggered continuous recordings are kept."
            label="Continuous (days)"
          />
        </GroupCard>

        <GroupCard name="MQTT" path="mqtt">
          <p className="text-[11px] leading-relaxed text-[var(--fg-muted)]">
            MQTT output (broker, topic prefix) is not exposed by the settings API yet. Edit the{' '}
            <code className="font-mono text-[var(--fg-secondary)]">mqtt:</code> section directly in{' '}
            <code className="font-mono text-[var(--fg-secondary)]">docker/frigate/config.yml</code>.
          </p>
        </GroupCard>

        <div className="flex flex-col gap-3 rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-4 lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg font-mono text-[11px] leading-snug text-[var(--fg-muted)]">
              Saving writes docker/frigate/config.yml and restarts Frigate — live streams may drop for a few seconds.
            </p>
            <Button disabled={saveState.kind === 'saving'} size="lg" type="submit">
              {saveState.kind === 'saving' ? 'Saving…' : 'Save config'}
            </Button>
          </div>
          {saveState.kind === 'saved' ? (
            <p className="font-mono text-xs text-[var(--status-live)]" role="status">
              ✓ {saveState.message}
            </p>
          ) : null}
          {saveState.kind === 'error' ? (
            <p className="font-mono text-xs text-[var(--status-error)]" role="alert">
              {saveState.message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  )
}
