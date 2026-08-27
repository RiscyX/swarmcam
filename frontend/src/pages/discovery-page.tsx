import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PulseDot } from '@/components/ui/pulse-dot'
import { useAuth } from '@/hooks/use-auth'
import { startDiscoveryStream } from '@/hooks/use-discovery-stream'
import { getNetworks, resetCameras, type NetworkInfo } from '@/lib/discovery'
import type { Camera } from '@/types/camera'

type LogLine = { message: string; kind: 'live' | 'idle' | 'cmd' | 'muted' }

type DiscoveryPageProps = {
  onCamerasFound: Dispatch<SetStateAction<Camera[]>>
}

const LINE_COLORS: Record<LogLine['kind'], string> = {
  live: 'text-[var(--status-live)]',
  idle: 'text-[var(--status-idle)]',
  cmd: 'text-[var(--fg)]',
  muted: 'text-[var(--fg-muted)]',
}

function classifyLine(msg: string): LogLine['kind'] {
  if (msg.startsWith('[ok]') || msg.startsWith('[+]')) return 'live'
  if (msg.startsWith('[warn]') || msg.startsWith('[!]') || msg.startsWith('[skip]')) return 'idle'
  if (msg.startsWith('$')) return 'cmd'
  return 'muted'
}

export function DiscoveryPage({ onCamerasFound }: DiscoveryPageProps) {
  const { token } = useAuth()
  const [networks, setNetworks]         = useState<NetworkInfo[]>([])
  const [subnet, setSubnet]             = useState('')
  const [port, setPort]                 = useState(4444)
  const [timeout, setTimeoutValue]      = useState(1)
  const [updateFrigate, setUpdateFrigate] = useState(false)
  const [logLines, setLogLines]         = useState<LogLine[]>([])
  const [isScanning, setIsScanning]     = useState(false)
  const [status, setStatus]             = useState('')

  const logRef = useRef<HTMLDivElement>(null)
  const lineCountRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    return () => {
      unmountedRef.current = true
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (!el || logLines.length === lineCountRef.current) return
    lineCountRef.current = logLines.length
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 40) {
      el.scrollTop = el.scrollHeight
    }
  }, [logLines])

  useEffect(() => {
    if (!token) return
    void getNetworks(token).then((items) => {
      setNetworks(items)
      if (items.length === 1) {
        setSubnet(items[0].subnet)
      }
    })
  }, [token])

  function appendLog(message: string) {
    setLogLines((cur) => [...cur, { message, kind: classifyLine(message) }])
  }

  async function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    if (isScanning) {
      abortRef.current?.abort()
      return
    }
    abortRef.current = new AbortController()
    setIsScanning(true)
    setStatus('')
    setLogLines([])
    try {
      await startDiscoveryStream({
        token,
        signal: abortRef.current.signal,
        body: { port, timeout, update_frigate: updateFrigate, ...(subnet ? { subnet } : {}) },
        onEvent: (e) => {
          if (e.type === 'progress') appendLog(e.message)
          if (e.type === 'result')   { onCamerasFound(e.cameras); setStatus(`${e.cameras.length} Android IP Camera node${e.cameras.length === 1 ? '' : 's'} found`) }
          if (e.type === 'done')     setIsScanning(false)
        },
      })
    } catch (err) {
      if (unmountedRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('Scan stopped')
      } else {
        setStatus(err instanceof Error ? err.message : 'Discovery error')
      }
      setIsScanning(false)
    } finally {
      abortRef.current = null
    }
  }

  async function handleReset() {
    if (!token || !window.confirm('Delete camera configuration?')) return
    await resetCameras(token)
    onCamerasFound([])
    setStatus('Cameras reset')
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch">
      {/* Scan panel */}
      <form className="flex flex-col gap-4 self-start rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)] p-4" onSubmit={handleScan}>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fg-secondary)]">
          Scan Parameters
        </div>

        <div>
          <Label htmlFor="discovery-subnet">Subnet</Label>
          <Input
            className="h-11 font-mono text-xs"
            id="discovery-subnet"
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="discovery-port">Port</Label>
            <Input
              className="h-11"
              id="discovery-port"
              min={1}
              onChange={(e) => setPort(Number(e.target.value))}
              type="number"
              value={port}
            />
          </div>
          <div>
            <Label htmlFor="discovery-timeout">Timeout (s)</Label>
            <Input
              className="h-11"
              id="discovery-timeout"
              min={0.5}
              onChange={(e) => setTimeoutValue(Number(e.target.value))}
              step={0.5}
              type="number"
              value={timeout}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--fg-muted)]">
          <input
            checked={updateFrigate}
            className="accent-[var(--accent)]"
            onChange={(e) => setUpdateFrigate(e.target.checked)}
            type="checkbox"
          />
          Update Frigate config
        </label>

        <Button
          className={
            isScanning
              ? 'h-12 w-full border border-[var(--accent)] bg-transparent text-[var(--accent-text)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]'
              : 'h-12 w-full'
          }
          type="submit"
        >
          {isScanning ? 'Stop Scan' : 'Start Scan'}
        </Button>

        <p className="text-xs leading-5 text-[var(--fg-muted)]">
          Runs discovery.py on the host machine and streams its stderr here over SSE.
        </p>

        <div className="mt-auto flex flex-col gap-2 border-t border-[var(--border-row)] pt-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fg-dim)]">
            Maintenance
          </div>
          <Button className="w-full" disabled={isScanning} onClick={handleReset} size="sm" type="button" variant="outline">
            Reset Cameras
          </Button>
          {status ? <div className="text-xs text-[var(--fg-muted)]">{status}</div> : null}
        </div>
      </form>

      {/* Live log */}
      <section className="flex min-h-[420px] flex-col overflow-hidden rounded-sm border border-[var(--border-raised)] bg-[var(--bg-canvas)] lg:min-h-[420px]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-row)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <PulseDot animated={isScanning} speed={1.2} tone={isScanning ? 'live' : 'offline'} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fg-secondary)]">
              Live Log
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">
            {logLines.length} lines
          </span>
        </header>
        <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-5">
          {logLines.length ? (
            logLines.map((line, i) => (
              <div className={LINE_COLORS[line.kind]} key={`${line.message}-${i}`}>
                {line.message}
              </div>
            ))
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-xs text-[var(--fg-dim)]">
              No active scan — press Start Scan
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
