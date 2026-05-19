import { useState } from 'react'

import { LoginOverlay } from '@/components/login-overlay'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { useCameras } from '@/hooks/use-cameras'
import { sectionLabels, type SectionId } from '@/lib/sections'
import { CamerasPage } from '@/pages/cameras-page'
import { PlaceholderPage } from '@/pages/placeholder-page'
import type { CameraLayout } from '@/types/camera'

export function AppShell() {
  const [activeSection, setActiveSection] = useState<SectionId>('cameras')
  const [cameraLayout, setCameraLayout] = useState<CameraLayout>('auto')
  const { cameras, error, isLoading, reload } = useCameras()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar
          activeSection={activeSection}
          cameraCount={cameras.length}
          cameraLayout={cameraLayout}
          onCameraLayoutChange={setCameraLayout}
        />
        <div className="flex-1 overflow-y-auto p-5">
          {activeSection === 'cameras' ? (
            <CamerasPage
              cameras={cameras}
              error={error}
              isLoading={isLoading}
              layout={cameraLayout}
              onLayoutChange={setCameraLayout}
              onReload={reload}
            />
          ) : (
            <PlaceholderPage section={activeSection} title={sectionLabels[activeSection]} />
          )}
        </div>
      </main>
      <LoginOverlay />
    </div>
  )
}
