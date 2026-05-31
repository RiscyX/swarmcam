import { useCallback, useState } from 'react'

import { EventFeedPanel } from '@/components/event-feed-panel'
import { FullscreenView } from '@/components/fullscreen-view'
import { LoginOverlay } from '@/components/login-overlay'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { useAuth } from '@/hooks/use-auth'
import { useCameras } from '@/hooks/use-cameras'
import { useCameraSocket } from '@/hooks/use-camera-socket'
import { setCameraTorch } from '@/lib/cameras'
import { sectionLabels, type SectionId } from '@/lib/sections'
import { CamerasPage } from '@/pages/cameras-page'
import { DiscoveryPage } from '@/pages/discovery-page'
import { HealthPage } from '@/pages/health-page'
import { PlaceholderPage } from '@/pages/placeholder-page'
import { SettingsPage } from '@/pages/settings-page'
import type { Camera, CameraLayout } from '@/types/camera'
import type { FrigateLiveEvent } from '@/types/events'

export function AppShell() {
  const { isAuthenticated, token } = useAuth()
  const [activeSection, setActiveSection] = useState<SectionId>('cameras')
  const [cameraLayout, setCameraLayout] = useState<CameraLayout>('auto')
  const [fullscreenCamera, setFullscreenCamera] = useState<Camera | null>(null)
  const [lastEventCamera, setLastEventCamera] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<FrigateLiveEvent[]>([])
  const [showEventFeed, setShowEventFeed] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const [torchStates, setTorchStates] = useState<Record<string, boolean>>({})
  const { cameras, error, isLoading, reload, setCameras } = useCameras()

  const handleAlert = useCallback((message: string) => {
    setAlerts((current) => [message, ...current].slice(0, 3))
  }, [])

  const handleEvent = useCallback((event: FrigateLiveEvent) => {
    setLiveEvents((current) => [event, ...current].slice(0, 20))
    setLastEventCamera(event.camera ?? null)
    window.setTimeout(() => setLastEventCamera((current) => (current === event.camera ? null : current)), 1000)
  }, [])

  const handleRenameCamera = useCallback(
    (name: string, displayName: string) => {
      setCameras((current) =>
        current.map((camera) => (camera.name === name ? { ...camera, display_name: displayName } : camera)),
      )
    },
    [setCameras],
  )

  const handleStatus = useCallback(
    (updates: Camera[]) => {
      setCameras((current) =>
        current.map((camera) => {
          const update = updates.find((item) => item.ip === camera.ip || item.name === camera.name)
          return update ? { ...camera, ...update } : camera
        }),
      )
    },
    [setCameras],
  )

  const socketStatus = useCameraSocket({
    enabled: isAuthenticated,
    onAlert: handleAlert,
    onEvent: handleEvent,
    onStatus: handleStatus,
  })

  async function toggleTorch(camera: Camera) {
    if (!token) return
    const nextEnabled = !torchStates[camera.name]
    try {
      await setCameraTorch(token, camera.name, nextEnabled)
      setTorchStates((current) => ({ ...current, [camera.name]: nextEnabled }))
    } catch {
      setAlerts((current) => [`Vaku kapcsolása sikertelen: ${camera.name}`, ...current].slice(0, 3))
    }
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar
          activeSection={activeSection}
          cameraCount={cameras.length}
          cameraLayout={cameraLayout}
          liveEventCount={liveEvents.length}
          showEventFeed={showEventFeed}
          socketStatus={socketStatus}
          onCameraLayoutChange={setCameraLayout}
          onToggleEventFeed={() => setShowEventFeed((v) => !v)}
        />
        {alerts.length ? (
          <div className="fixed right-5 top-16 z-30 grid gap-2">
            {alerts.map((message, index) => (
              <div className="rounded-sm border border-swarm-amber bg-card px-4 py-3 font-mono text-xs text-swarm-amber shadow-lg" key={`${message}-${index}`}>
                {message}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto p-5">
            {activeSection === 'cameras' ? (
              <CamerasPage
                cameras={cameras}
                error={error}
                eventCamera={lastEventCamera}
                isLoading={isLoading}
                layout={cameraLayout}
                onLayoutChange={setCameraLayout}
                onOpenFullscreen={setFullscreenCamera}
                onRenameCamera={handleRenameCamera}
                onReload={reload}
                onToggleTorch={toggleTorch}
                paused={Boolean(fullscreenCamera)}
                torchStates={torchStates}
              />
            ) : activeSection === 'health' ? (
              <HealthPage cameras={cameras} isLoading={isLoading} />
            ) : activeSection === 'discovery' ? (
              <DiscoveryPage onCamerasFound={setCameras} />
            ) : activeSection === 'settings' ? (
              <SettingsPage />
            ) : (
              <PlaceholderPage section={activeSection} title={sectionLabels[activeSection]} />
            )}
          </div>
          {showEventFeed && activeSection === 'cameras' ? (
            <EventFeedPanel
              cameras={cameras}
              events={liveEvents}
              onClear={() => setLiveEvents([])}
            />
          ) : null}
        </div>
      </main>
      <FullscreenView
        camera={fullscreenCamera}
        onClose={() => setFullscreenCamera(null)}
        onToggleTorch={toggleTorch}
        torchEnabled={fullscreenCamera ? Boolean(torchStates[fullscreenCamera.name]) : false}
      />
      <LoginOverlay />
    </div>
  )
}
