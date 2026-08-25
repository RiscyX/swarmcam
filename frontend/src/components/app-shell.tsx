import { useCallback, useState } from 'react'

import { EventFeedPanel } from '@/components/event-feed-panel'
import { FullscreenView } from '@/components/fullscreen-view'
import { LoginOverlay } from '@/components/login-overlay'
import { MobileHeader, MobileTabBar } from '@/components/mobile-nav'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { Toast, ToastContainer } from '@/components/ui/toast'
import { useAuth } from '@/hooks/use-auth'
import { useBreakpoint } from '@/hooks/use-breakpoint'
import { useCameras } from '@/hooks/use-cameras'
import { useCameraSocket } from '@/hooks/use-camera-socket'
import { setCameraTorch } from '@/lib/cameras'
import { sectionLabels, type SectionId } from '@/lib/sections'
import { CameraSettingsPage } from '@/pages/camera-settings-page'
import { CamerasPage } from '@/pages/cameras-page'
import { DiscoveryPage } from '@/pages/discovery-page'
import { EventsPage } from '@/pages/events-page'
import { FacesPage } from '@/pages/faces-page'
import { HealthPage } from '@/pages/health-page'
import { PlaceholderPage } from '@/pages/placeholder-page'
import { RecordingsPage } from '@/pages/recordings-page'
import { SettingsPage } from '@/pages/settings-page'
import { UsersPage } from '@/pages/users-page'
import type { Camera, CameraLayout } from '@/types/camera'
import type { FrigateLiveEvent } from '@/types/events'

type Alert = {
  id: string
  message: string
}

const LAYOUT_STORAGE_KEY = 'swarmcam.layout'
const VALID_LAYOUTS: CameraLayout[] = ['auto', '2x2', '3x3']

function readStoredLayout(): CameraLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (stored && (VALID_LAYOUTS as string[]).includes(stored)) return stored as CameraLayout
  } catch {
    // localStorage elérhetetlen (privát mód, letiltott sütik) — marad az alapértelmezett
  }
  return 'auto'
}

export function AppShell() {
  const { isAuthenticated, token } = useAuth()
  const [activeSection, setActiveSection] = useState<SectionId>('cameras')
  const [cameraLayout, setCameraLayout] = useState<CameraLayout>(readStoredLayout)
  const [fullscreenCamera, setFullscreenCamera] = useState<Camera | null>(null)
  const [lastEventCamera, setLastEventCamera] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<FrigateLiveEvent[]>([])
  const [showEventFeed, setShowEventFeed] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [torchStates, setTorchStates] = useState<Record<string, boolean>>({})
  const { cameras, error, isLoading, reload, setCameras } = useCameras()
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'

  const handleAlert = useCallback((message: string) => {
    const id = Math.random().toString(36).substring(2, 9)
    setAlerts((current) => [{ id, message }, ...current].slice(0, 3))
    window.setTimeout(() => {
      setAlerts((current) => current.filter((a) => a.id !== id))
    }, 8000)
  }, [])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((a) => a.id !== id))
  }, [])

  const handleLayoutChange = useCallback((next: CameraLayout) => {
    setCameraLayout(next)
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, next)
    } catch {
      // localStorage írás sikertelen — a layout csak addig él, amíg az oldal meg van nyitva
    }
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

  const handleDeleteCamera = useCallback(
    (name: string) => {
      setCameras((current) => current.filter((camera) => camera.name !== name))
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
      handleAlert(`Failed to toggle torch: ${camera.name}`)
    }
  }

  const pageSection =
    activeSection === 'cameras' ? (
      <CamerasPage
        cameras={cameras}
        error={error}
        eventCamera={lastEventCamera}
        isLoading={isLoading}
        layout={cameraLayout}
        onLayoutChange={handleLayoutChange}
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
    ) : activeSection === 'camera-settings' ? (
      <CameraSettingsPage cameras={cameras} onDeleteCamera={handleDeleteCamera} onRenameCamera={handleRenameCamera} />
    ) : activeSection === 'events' ? (
      <EventsPage cameras={cameras} />
    ) : activeSection === 'recordings' ? (
      <RecordingsPage cameras={cameras} />
    ) : activeSection === 'faces' ? (
      <FacesPage />
    ) : activeSection === 'users' ? (
      <UsersPage />
    ) : activeSection === 'settings' ? (
      <SettingsPage />
    ) : (
      <PlaceholderPage section={activeSection} title={sectionLabels[activeSection]} />
    )

  const toasts =
    alerts.length > 0 ? (
      <ToastContainer>
        {alerts.map((alert) => (
          <Toast key={alert.id} onDismiss={() => dismissAlert(alert.id)} title={alert.message} variant="error" />
        ))}
      </ToastContainer>
    ) : null

  const camerasUp = cameras.filter((camera) => camera.online).length

  return (
    <div
      className={`flex bg-background text-foreground ${
        isMobile ? 'h-dvh flex-col overflow-hidden' : 'min-h-screen'
      }`}
    >
      {isMobile ? (
        <MobileHeader
          cameraCount={cameras.length}
          camerasUp={camerasUp}
          liveEventCount={liveEvents.length}
          showEventFeed={showEventFeed}
          onToggleEventFeed={() => setShowEventFeed((v) => !v)}
        />
      ) : (
        <Sidebar
          activeSection={activeSection}
          liveEventCount={liveEvents.length}
          onSectionChange={setActiveSection}
          socketStatus={socketStatus}
          variant={breakpoint === 'tablet' ? 'rail' : 'full'}
        />
      )}
      <main className={`flex min-w-0 flex-1 flex-col ${isMobile ? 'min-h-0' : ''}`}>
        {!isMobile ? (
          <Topbar
            activeSection={activeSection}
            cameraCount={cameras.length}
            cameraLayout={cameraLayout}
            camerasUp={camerasUp}
            liveEventCount={liveEvents.length}
            showEventFeed={showEventFeed}
            socketStatus={socketStatus}
            onCameraLayoutChange={handleLayoutChange}
            onToggleEventFeed={() => setShowEventFeed((v) => !v)}
          />
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div
            className={`min-w-0 flex-1 ${
              activeSection === 'cameras' ? 'overflow-hidden' : 'overflow-y-auto p-5'
            }`}
          >
            {pageSection}
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
      {isMobile ? (
        <>
          <MobileTabBar activeSection={activeSection} onSectionChange={setActiveSection} />
        </>
      ) : null}
      {toasts}
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
