import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
            setStatus(`${streamEvent.cameras.length} kamera találva`)
          }
          if (streamEvent.type === 'done') setIsScanning(false)
        },
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Discovery hiba')
      setIsScanning(false)
    }
  }

  async function handleReset() {
    if (!token || !window.confirm('Biztosan törlöd a kamera konfigurációt?')) return
    await resetCameras(token)
    onCamerasFound([])
    setStatus('Kamerák resetelve')
  }

  async function handleClearRecordings() {
    if (!token || !window.confirm('Biztosan törlöd az összes Frigate felvételt és klipet?')) return
    const result = await clearRecordings(token)
    setStatus(`Felvételek törölve: ${result.cleared_mb} MB`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="grid gap-4">
        <Card className="border-border bg-card/90">
          <CardHeader>
            <CardTitle className="font-ui uppercase tracking-[0.14em]">Scan Configuration</CardTitle>
            <CardDescription>IP Webcam eszközök keresése a lokális hálózaton</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleScan}>
              <label className="grid gap-1.5">
                <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Hálózat</span>
                <select className="h-9 rounded-sm border border-input bg-background px-3 font-mono text-sm" onChange={(event) => setSubnet(event.target.value)} value={subnet}>
                  <option value="">auto-detect</option>
                  {networks.map((network) => (
                    <option key={network.subnet} value={network.subnet}>
                      {network.iface} {network.ip} ({network.subnet})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Port</span>
                  <Input min={1} onChange={(event) => setPort(Number(event.target.value))} type="number" value={port} />
                </label>
                <label className="grid gap-1.5">
                  <span className="font-ui text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Timeout</span>
                  <Input min={0.5} onChange={(event) => setTimeoutValue(Number(event.target.value))} step={0.5} type="number" value={timeout} />
                </label>
              </div>
              <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <input checked={updateFrigate} onChange={(event) => setUpdateFrigate(event.target.checked)} type="checkbox" />
                Frigate config frissítése
              </label>
              <Button className="w-full" disabled={isScanning} type="submit">
                {isScanning ? 'Scanning...' : 'Scan Network'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/90">
          <CardHeader>
            <CardTitle className="font-ui uppercase tracking-[0.14em]">Camera Management</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button onClick={handleReset} variant="outline">Reset Cameras</Button>
            <Button onClick={handleClearRecordings} variant="destructive">Delete Recordings</Button>
            {status ? <div className="font-mono text-xs text-swarm-amber">{status}</div> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-ui uppercase tracking-[0.14em]">Discovery Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="min-h-[420px] overflow-y-auto rounded-sm border border-border bg-background p-3 font-mono text-xs leading-6 text-muted-foreground">
            {logLines.length ? (
              logLines.map((line, index) => (
                <div className={line.kind === 'found' ? 'text-swarm-green' : line.kind === 'warn' ? 'text-swarm-amber' : ''} key={`${line.message}-${index}`}>
                  {line.message}
                </div>
              ))
            ) : (
              <div className="text-center">Nincs aktív scan</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
