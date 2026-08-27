import { GalleryThumbnails, Grid2X2, Grid3X3, LayoutGrid } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { CameraLayout } from '@/types/camera'

type LayoutPickerProps = {
  layout: CameraLayout
  onChange: (layout: CameraLayout) => void
  variant?: 'bar' | 'chips'
}

const LAYOUTS: Array<{ id: CameraLayout; label: string; icon: LucideIcon; title: string }> = [
  { icon: LayoutGrid, id: 'auto', label: 'AUTO', title: 'Auto – minden kamera belefér a viewportba' },
  { icon: Grid2X2, id: '2x2', label: '2×2', title: '2×2 – első 4 kamera' },
  { icon: Grid3X3, id: '3x3', label: '3×3', title: '3×3 – első 9 kamera' },
  { icon: GalleryThumbnails, id: 'spotlight', label: 'FOCUS', title: 'Focus – egy nagy kamera, alatta filmstrip' },
]

const baseButton =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 border-transparent font-medium transition-colors'
const inactive = 'bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
const active = 'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]'

export function LayoutPicker({ layout, onChange, variant = 'bar' }: LayoutPickerProps) {
  if (variant === 'chips') {
    return (
      <div className="flex gap-1.5 overflow-x-auto px-4 py-1.5">
        {LAYOUTS.map(({ icon: Icon, id, label, title }) => (
          <button
            className={`${baseButton} h-11 rounded-sm border px-3 text-xs ${layout === id ? active : `${inactive} border-[var(--border)] bg-[var(--bg-surface)]`}`}
            key={id}
            onClick={() => onChange(id)}
            title={title}
            type="button"
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-sm border border-[var(--border)] bg-[var(--bg-app)] p-0.5">
      {LAYOUTS.map(({ icon: Icon, id, label, title }) => (
        <button
          className={`${baseButton} h-6 rounded-[2px] px-1.5 text-[11px] ${layout === id ? active : inactive}`}
          key={id}
          onClick={() => onChange(id)}
          title={title}
          type="button"
        >
          <Icon aria-hidden className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  )
}
