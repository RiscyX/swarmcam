import * as React from 'react'
import { createPortal } from 'react-dom'
import { Activity, Bell, Camera, Clapperboard, HeartPulse, Menu, Moon, Radar, Sun } from 'lucide-react'

import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { sectionLabels, type SectionId } from '@/lib/sections'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type MobileHeaderProps = {
  cameraCount: number
  camerasUp: number
  liveEventCount: number
  showEventFeed: boolean
  onToggleEventFeed: () => void
}

export function MobileHeader({ cameraCount, camerasUp, liveEventCount, showEventFeed, onToggleEventFeed }: MobileHeaderProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--border-row)] bg-[var(--bg-chrome)] px-3">
      <span className="h-[14px] w-[14px] shrink-0 bg-[var(--accent)]" />
      <span className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--fg)]">SwarmCam</span>
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {/* 360px alatt a chip esik ki — a témagomb sosem */}
        <span className="hidden rounded-sm border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fg-muted)] min-[360px]:inline">
          <span className={camerasUp > 0 ? 'text-[var(--status-live)]' : ''}>
            {camerasUp}/{cameraCount} up
          </span>
        </span>
        <button
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-pressed={theme === 'light'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]"
          onClick={toggleTheme}
          type="button"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          aria-label={showEventFeed ? 'Close event feed' : 'Open event feed'}
          aria-pressed={showEventFeed}
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-sm transition-colors',
            showEventFeed
              ? 'bg-[var(--bg-surface)] text-[var(--fg)]'
              : 'text-[var(--fg-muted)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]',
          )}
          onClick={onToggleEventFeed}
          type="button"
        >
          <Bell className="h-5 w-5" />
          {liveEventCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center bg-[var(--accent)] px-0.5 font-mono text-[10px] font-bold leading-none text-[var(--accent-fg)]">
              {liveEventCount}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  )
}

type MobileTabBarProps = {
  activeSection: SectionId
  onSectionChange: (section: SectionId) => void
}

const tabs: Array<{ id: SectionId | 'more'; label: string; icon: typeof Camera }> = [
  { id: 'cameras', label: 'Cams', icon: Camera },
  { id: 'events', label: 'Events', icon: Activity },
  { id: 'recordings', label: 'Recs', icon: Clapperboard },
  { id: 'health', label: 'Health', icon: HeartPulse },
  { id: 'discovery', label: 'Scan', icon: Radar },
]

const tabSectionIds = new Set(
  tabs.flatMap((tab) => (tab.id === 'more' ? [] : [tab.id as SectionId])),
)

export function MobileTabBar({ activeSection, onSectionChange }: MobileTabBarProps) {
  const [moreOpen, setMoreOpen] = React.useState(false)

  const renderTab = (tab: { id: SectionId | 'more'; label: string; icon: typeof Camera }) => {
    const active = tab.id !== 'more' && activeSection === tab.id
    const Icon = tab.icon
    return (
      <button
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 pt-0.5 transition-colors',
          active
            ? 'border-t-[var(--accent)] bg-[var(--bg-chrome)] text-[var(--fg)]'
            : 'border-t-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]',
        )}
        key={tab.id}
        onClick={() => (tab.id === 'more' ? setMoreOpen(true) : onSectionChange(tab.id))}
        type="button"
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="font-mono text-[10px] uppercase tracking-wide">{tab.label}</span>
      </button>
    )
  }

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="flex h-[66px] shrink-0 items-stretch border-t border-[var(--border)] bg-[var(--bg-app)] pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map(renderTab)}
        {renderTab({ id: 'more', label: 'More', icon: Menu })}
      </nav>
      <MoreDrawer activeSection={activeSection} onClose={() => setMoreOpen(false)} onSectionChange={onSectionChange} open={moreOpen} />
    </>
  )
}

type MoreDrawerProps = {
  activeSection: SectionId
  open: boolean
  onClose: () => void
  onSectionChange: (section: SectionId) => void
}

function MoreDrawer({ activeSection, open, onClose, onSectionChange }: MoreDrawerProps) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const titleId = React.useId()

  React.useEffect(() => {
    if (!open) return undefined
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !contentRef.current) return
    const focusable = Array.from(contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || !contentRef.current.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !contentRef.current.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[var(--scrim)] backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[75%] flex-col overflow-hidden border-t-2 border-t-[var(--accent)] bg-[var(--bg-surface)] text-[var(--fg)] shadow-xl outline-none animate-in slide-in-from-bottom fade-in duration-200"
        onClick={(event) => event.stopPropagation()}
        ref={contentRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2
          className="shrink-0 border-b border-[var(--border-row)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]"
          id={titleId}
        >
          Sections
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {(Object.keys(sectionLabels) as SectionId[])
            .filter((id) => !tabSectionIds.has(id))
            .map((id) => {
            const active = activeSection === id
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[52px] w-full items-center px-4 text-left text-sm transition-colors',
                  active
                    ? 'bg-[var(--bg-chrome)] font-extrabold text-[var(--fg)]'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]',
                )}
                key={id}
                onClick={() => {
                  onSectionChange(id)
                  onClose()
                }}
                type="button"
              >
                {sectionLabels[id]}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
