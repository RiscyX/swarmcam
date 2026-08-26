import { useEffect, useState, useSyncExternalStore } from 'react'

import { useBreakpoint } from '@/hooks/use-breakpoint'
import { cameraSnapshotUrl } from '@/lib/cameras'

const SNAPSHOT_INTERVAL_MS = 5000

type StreamRegistration = {
  order: number
  preferred: boolean
}

const registrations = new Map<string, StreamRegistration>()
const listeners = new Set<() => void>()
let nextOrder = 0

function emitChange() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getFocusedCamera(): string | null {
  let focused: StreamRegistration | null = null
  let focusedName: string | null = null
  for (const [name, entry] of registrations) {
    const wins =
      !focused ||
      (entry.preferred && !focused.preferred) ||
      (entry.preferred === focused.preferred && entry.order < focused.order)
    if (wins) {
      focused = entry
      focusedName = name
    }
  }
  return focusedName
}

export type CameraStreamMode = 'stream' | 'snapshot' | 'paused'

type UseCameraStreamArgs = {
  name: string
  paused: boolean
  preferred?: boolean
}

type UseCameraStreamResult = {
  mode: CameraStreamMode
  snapshotSrc: string | null
}

export function useCameraStream({ name, paused, preferred = false }: UseCameraStreamArgs): UseCameraStreamResult {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const [snapshotTick, setSnapshotTick] = useState(0)

  const focusedName = useSyncExternalStore(subscribe, getFocusedCamera)

  useEffect(() => {
    registrations.set(name, { order: nextOrder++, preferred: false })
    emitChange()
    return () => {
      registrations.delete(name)
      emitChange()
    }
  }, [name])

  useEffect(() => {
    const entry = registrations.get(name)
    if (entry && entry.preferred !== preferred) {
      entry.preferred = preferred
      emitChange()
    }
  }, [name, preferred])

  const mode: CameraStreamMode = paused
    ? 'paused'
    : !isMobile || focusedName === name
      ? 'stream'
      : 'snapshot'

  useEffect(() => {
    if (mode !== 'snapshot') return undefined
    const intervalId = window.setInterval(() => {
      setSnapshotTick((tick) => tick + 1)
    }, SNAPSHOT_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [mode, name])

  const snapshotSrc = mode === 'snapshot' ? cameraSnapshotUrl(name, snapshotTick) : null

  return { mode, snapshotSrc }
}
