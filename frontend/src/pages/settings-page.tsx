import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import { getConfig, getSystemInfo, saveConfig, type ConfigSettings, type DecoderType, type SystemInfo } from '@/lib/config'

const objectOptions = ['person', 'car', 'cat', 'dog', 'bicycle', 'motorcycle']
const decoderOptions: DecoderType[] = ['cpu', 'nvidia', 'intel', 'coral']

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

function decoderDisabled(decoder: DecoderType, system: SystemInfo | null) {
  if (!system) return false
  if (decoder === 'nvidia') return !system.nvidia_gpu && !system.nvidia_docker
  if (decoder === 'intel') return !system.intel_gpu
  return false
}

export function SettingsPage() {
  const { token } = useAuth()
  const [config, setConfig] = useState<ConfigSettings>(emptyConfig)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    void Promise.all([getConfig(token), getSystemInfo(token)]).then(([nextConfig, nextSystem]) => {
      setConfig(nextConfig)
      setSystem(nextSystem)
    })
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    setIsSaving(true)
    setStatus('')
    try {
      const result = await saveConfig(token, config)
      if (result.decoder_changed) setStatus('Saved - stack restarted')
      else if (result.frigate_restarted) setStatus('Saved - Frigate restarted')
      else setStatus('Saved - Frigate not running, config applied on startup')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
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

  return (
    <form className="grid max-w-5xl gap-4 lg:grid-cols-2" onSubmit={handleSubmit}>
      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Hardware decoder</CardTitle>
          <CardDescription>NVIDIA/Intel options automatically disabled if not available</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {decoderOptions.map((decoder) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground has-[:checked]:border-swarm-amber has-[:checked]:text-swarm-amber has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40" key={decoder}>
              <input
                checked={config.decoder === decoder}
                disabled={decoderDisabled(decoder, system)}
                name="decoder"
                onChange={() => updateConfig({ decoder })}
                type="radio"
              />
              {decoder}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Detection</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">FPS</span>
            <Input onChange={(event) => updateConfig({ detection_fps: Number(event.target.value) })} type="number" value={config.detection_fps} />
          </label>
          <label className="grid gap-1.5">
            <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Resolution</span>
            <select
              className="h-9 rounded-sm border border-input bg-background px-3 font-mono text-sm"
              onChange={(event) => {
                const [detection_width, detection_height] = event.target.value.split('x').map(Number)
                updateConfig({ detection_width, detection_height })
              }}
              value={`${config.detection_width}x${config.detection_height}`}
            >
              <option value="640x360">640x360</option>
              <option value="1280x720">1280x720</option>
              <option value="1920x1080">1920x1080</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Stream transport</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(['tcp', 'udp'] as const).map((transport) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground has-[:checked]:border-swarm-amber has-[:checked]:text-swarm-amber" key={transport}>
              <input checked={config.rtsp_transport === transport} name="rtsp" onChange={() => updateConfig({ rtsp_transport: transport })} type="radio" />
              {transport.toUpperCase()}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Tracked objects</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {objectOptions.map((object) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground has-[:checked]:border-swarm-amber has-[:checked]:text-swarm-amber" key={object}>
              <input checked={config.objects.includes(object)} onChange={(event) => toggleObject(object, event.target.checked)} type="checkbox" />
              {object}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Recording retention</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Motion (days)</span>
            <Input onChange={(event) => updateConfig({ record_motion_days: Number(event.target.value) })} type="number" value={config.record_motion_days} />
          </label>
          <label className="grid gap-1.5">
            <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Event (days)</span>
            <Input onChange={(event) => updateConfig({ record_event_days: Number(event.target.value) })} type="number" value={config.record_event_days} />
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 lg:col-span-2">
        <Button disabled={isSaving} type="submit">{isSaving ? 'Saving...' : 'Save & Apply'}</Button>
        {status ? <span className="font-mono text-xs text-swarm-amber">{status}</span> : null}
      </div>
    </form>
  )
}
