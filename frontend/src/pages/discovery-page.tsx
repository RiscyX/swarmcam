import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import { startDiscoveryStream } from '@/hooks/use-discovery-stream'
import { clearRecordings, discoverXmStreamUrl, getNetworks, resetCameras, type NetworkInfo, type XMDiscoverRequest } from '@/lib/discovery'
import type { Camera } from '@/types/camera'

type LogLine = { message: string; kind: 'found' | 'warn' | 'normal' }

type DiscoveryPageProps = {
  onCamerasFound: Dispatch<SetStateAction<Camera[]>>
}

function classifyLine(msg: string): LogLine['kind'] {
  if (msg.startsWith('[+]')) return 'found'
  if (msg.startsWith('[!]')) return 'warn'
  return 'normal'
}

// Generic SSE stream reader for the XM endpoint (same format as IP Webcam stream)
async function startXmStream(token: string, body: XMDiscoverRequest, onEvent: (e: { type: string; message?: string; cameras?: Camera[] }) => void) {
  const res = await fetch(discoverXmStreamUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw new Error(`XM stream failed: ${res.status}`)

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const chunks = buf.split('\n\n')
    buf = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const type = chunk.match(/^event: (.+)$/m)?.[1]
      const data = chunk.match(/^data: (.+)$/m)?.[1]
      if (!type) continue
      if (type === 'done') { onEvent({ type: 'done' }); continue }
      if (!data) continue
      if (type === 'progress') onEvent({ type: 'progress', message: JSON.parse(data) as string })
      if (type === 'result')   onEvent({ type: 'result',   cameras: JSON.parse(data) as Camera[] })
    }
  }
}

export function DiscoveryPage({ onCamerasFound }: DiscoveryPageProps) {
  const { token } = useAuth()
  const [networks, setNetworks]       = useState<NetworkInfo[]>([])
  const [subnet, setSubnet]           = useState('')
  const [port, setPort]               = useState(8080)
  const [timeout, setTimeoutValue]    = useState(1)
  const [updateFrigate, setUpdateFrigate] = useState(false)
  const [logLines, setLogLines]       = useState<LogLine[]>([])
  const [isScanning, setIsScanning]   = useState(false)
  const [status, setStatus]           = useState('')

  // XM scan state
  const [xmSubnet, setXmSubnet]               = useState('')
  const [xmTimeout, setXmTimeout]             = useState(1)
  const [xmUpdateFrigate, setXmUpdateFrigate] = useState(false)
  const [isXmScanning, setIsXmScanning]       = useState(false)

  useEffect(() => {
    if (!token) return
    void getNetworks(token).then((items) => {
      setNetworks(items)
      if (items.length === 1) {
        setSubnet(items[0].subnet)
        setXmSubnet(items[0].subnet)
      }
    })
  }, [token])

  function appendLog(message: string) {
    setLogLines((cur) => [...cur, { message, kind: classifyLine(message) }])
  }

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
        onEvent: (e) => {
          if (e.type === 'progress') appendLog(e.message)
          if (e.type === 'result')   { onCamerasFound(e.cameras); setStatus(`${e.cameras.length} IP Webcam camera${e.cameras.length === 1 ? '' : 's'} found`) }
          if (e.type === 'done')     setIsScanning(false)
        },
      })
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Discovery error')
      setIsScanning(false)
    }
  }

  async function handleXmScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setIsXmScanning(true)
    setStatus('')
    setLogLines([])
    try {
      await startXmStream(
        token,
        { timeout: xmTimeout, update_frigate: xmUpdateFrigate, ...(xmSubnet ? { subnet: xmSubnet } : {}) },
        (e) => {
          if (e.type === 'progress' && e.message) appendLog(e.message)
          if (e.type === 'result' && e.cameras) {
            // Merge XM cameras into existing list
            onCamerasFound((cur) => {
              const names = new Set(e.cameras!.map((c) => c.name))
              return [...cur.filter((c) => !names.has(c.name)), ...e.cameras!]
            })
            setStatus(`${e.cameras.length} XM camera${e.cameras.length === 1 ? '' : 's'} found`)
          }
          if (e.type === 'done') setIsXmScanning(false)
        },
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'XM scan error')
      setIsXmScanning(false)
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
      {/* Left column */}
      <div className="flex flex-col gap-3">

        {/* IP Webcam scan */}
        <div className="rounded border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium text-foreground">IP Webcam Scan</div>
          <div className="mb-3 text-xs text-muted-foreground">Android phones running IP Webcam APK</div>
          <form className="space-y-3" onSubmit={handleScan}>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Network</span>
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
            <Button className="w-full" disabled={isScanning || isXmScanning} type="submit">
              {isScanning ? 'Scanning...' : 'Scan Network'}
            </Button>
          </form>
        </div>

        {/* XM camera scan */}
        <div className="rounded border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium text-foreground">XM Camera Scan</div>
          <div className="mb-3 text-xs text-muted-foreground">WiFi cameras using XMEye / Sofia chipset (port 34567)</div>
          <form className="space-y-3" onSubmit={handleXmScan}>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Network</span>
              <Input
                className="font-mono text-xs"
                list="network-suggestions"
                onChange={(e) => setXmSubnet(e.target.value)}
                placeholder="auto-detect (e.g. 192.168.0.0/24)"
                value={xmSubnet}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Timeout (s)</span>
              <Input min={0.5} onChange={(e) => setXmTimeout(Number(e.target.value))} step={0.5} type="number" value={xmTimeout} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input checked={xmUpdateFrigate} onChange={(e) => setXmUpdateFrigate(e.target.checked)} type="checkbox" />
              Update Frigate config
            </label>
            <Button className="w-full" disabled={isScanning || isXmScanning} type="submit" variant="outline">
              {isXmScanning ? 'Scanning...' : 'Scan XM Cameras'}
            </Button>
          </form>
        </div>

        {/* Management */}
        <div className="rounded border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium text-foreground">Management</div>
          <div className="flex flex-col gap-2">
            <Button disabled={isScanning || isXmScanning} onClick={handleReset} size="sm" variant="outline">Reset Cameras</Button>
            <Button disabled={isScanning || isXmScanning} onClick={handleClearRecordings} size="sm" variant="destructive">Delete Recordings</Button>
            {status ? <div className="text-xs text-muted-foreground">{status}</div> : null}
          </div>
        </div>
      </div>

      {/* Log panel */}
      <div className="rounded border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Discovery Log</span>
          {(isScanning || isXmScanning) && (
            <span className="font-mono text-xs text-swarm-blue">scanning...</span>
          )}
        </div>
        <div className="min-h-[420px] overflow-y-auto rounded border border-border bg-background p-3 font-mono text-xs leading-6">
          {logLines.length ? (
            logLines.map((line, i) => (
              <div
                className={
                  line.kind === 'found' ? 'text-swarm-green' :
                  line.kind === 'warn'  ? 'text-swarm-red'   :
                  'text-muted-foreground'
                }
                key={`${line.message}-${i}`}
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
