import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import { startDiscoveryStream } from '@/hooks/use-discovery-stream'
import { clearRecordings, getNetworks, resetCameras, type NetworkInfo } from '@/lib/discovery'
import type { Camera } from '@/types/camera'

type DiscoveryPageProps = {
  onCamerasFound: Dispatch<SetStateAction<Camera[]>>
}

export function DiscoveryPage({ onCamerasFound }: DiscoveryPageProps) {
  const { token } = useAuth()
  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [subnet, setSubnet] = useState('')
  const [port, setPort] = useState(8080)
  const [timeout, setTimeoutValue] = useState(1)
  const [updateFrigate, setUpdateFrigate] = useState(false)
  const [logLines, setLogLines] = useState<Array<{ message: string; kind: 'found' | 'warn' | 'normal' }>>([])
  const [isScanning, setIsScanning] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!token) return
    void getNetworks(token).then((items) => {
      setNetworks(items)
      if (items.length === 1) setSubnet(items[0].subnet)
    })
  }, [token])

  async function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setIsScanning(true)
    setStatus('')
    setLogLines([])
    try {
      await startDiscoveryStream({
        token,
        body: { port, timeout, update_frigate: updateFrigate, ...(subnet ? { subnet } : {}) },
        onEvent: (streamEvent) => {
          if (streamEvent.type === 'progress') {
            setLogLines((current) => [
              ...current,
              {
                message: streamEvent.message,
                kind: streamEvent.message.startsWith('[+]') ? 'found' : streamEvent.message.startsWith('[!]') ? 'warn' : 'normal',
              },
            ])
          }
          if (streamEvent.type === 'result') {
            onCamerasFound(streamEvent.cameras)
            setStatus(`${streamEvent.cameras.length} camera${streamEvent.cameras.length === 1 ? '' : 's'} found`)
          }
          if (streamEvent.type === 'done') setIsScanning(false)
        },
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Discovery error')
      setIsScanning(false)
    }
  }

  async function handleReset() {
    if (!token || !window.confirm('Delete camera configuration?')) return
    await resetCameras(token)
    onCamerasFound([])
    setStatus('Cameras reset')
  }

  async function handleClearRecordings() {
    if (!token || !window.confirm('Delete all Frigate recordings and clips?')) return
    const result = await clearRecordings(token)
    setStatus(`Recordings deleted: ${result.cleared_mb} MB`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Config panel */}
      <div className="flex flex-col gap-3">
        <div className="rounded border border-border bg-card p-4">
          <div className="mb-4 text-sm font-medium text-foreground">Scan Configuration</div>
          <form className="space-y-3" onSubmit={handleScan}>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Network</span>
              <div className="flex gap-2">
                <Input
                  className="font-mono text-xs"
                  list="network-suggestions"
                  onChange={(e) => setSubnet(e.target.value)}
                  placeholder="auto-detect (e.g. 192.168.0.0/24)"
                  value={subnet}
                />
                <datalist id="network-suggestions">
                  {networks.map((n) => (
                    <option key={n.subnet} value={n.subnet}>{n.iface} – {n.ip}</option>
                  ))}
                </datalist>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Port</span>
                <Input min={1} onChange={(e) => setPort(Number(e.target.value))} type="number" value={port} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Timeout (s)</span>
                <Input min={0.5} onChange={(e) => setTimeoutValue(Number(e.target.value))} step={0.5} type="number" value={timeout} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input checked={updateFrigate} onChange={(e) => setUpdateFrigate(e.target.checked)} type="checkbox" />
              Update Frigate config
            </label>
            <Button className="w-full" disabled={isScanning} type="submit">
              {isScanning ? 'Scanning...' : 'Scan Network'}
            </Button>
          </form>
        </div>

        <div className="rounded border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium text-foreground">Management</div>
          <div className="flex flex-col gap-2">
            <Button onClick={handleReset} variant="outline" size="sm">Reset Cameras</Button>
            <Button onClick={handleClearRecordings} variant="destructive" size="sm">Delete Recordings</Button>
            {status ? <div className="text-xs text-muted-foreground">{status}</div> : null}
          </div>
        </div>
      </div>

      {/* Log panel */}
      <div className="rounded border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium text-foreground">Discovery Log</div>
        <div className="min-h-[360px] overflow-y-auto rounded border border-border bg-background p-3 font-mono text-xs leading-6 text-muted-foreground">
          {logLines.length ? (
            logLines.map((line, index) => (
              <div
                className={line.kind === 'found' ? 'text-swarm-green' : line.kind === 'warn' ? 'text-swarm-red' : ''}
                key={`${line.message}-${index}`}
              >
                {line.message}
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground">No active scan</div>
          )}
        </div>
      </div>
    </div>
  )
}
