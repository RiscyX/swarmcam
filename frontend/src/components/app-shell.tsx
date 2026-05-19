import { useState } from 'react'

import { LoginOverlay } from '@/components/login-overlay'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { sectionLabels, type SectionId } from '@/lib/sections'
import { PlaceholderPage } from '@/pages/placeholder-page'

export function AppShell() {
  const [activeSection, setActiveSection] = useState<SectionId>('cameras')

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar activeSection={activeSection} />
        <div className="flex-1 overflow-y-auto p-5">
          <PlaceholderPage section={activeSection} title={sectionLabels[activeSection]} />
        </div>
      </main>
      <LoginOverlay />
    </div>
  )
}
