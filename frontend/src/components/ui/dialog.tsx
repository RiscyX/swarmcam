import * as React from 'react'
import { createPortal } from 'react-dom'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const dialogConfirmVariants = cva('', {
  variants: {
    variant: {
      default: '',
      destructive: 'border-transparent bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface DialogProps extends VariantProps<typeof dialogConfirmVariants> {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  (
    { open, onClose, title, description, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, variant },
    ref,
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null)
    const restoreFocusRef = React.useRef<HTMLElement | null>(null)
    const titleId = React.useId()

    React.useEffect(() => {
      if (!open) return
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const frame = window.requestAnimationFrame(() => {
        const focusable = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(focusable && focusable.length > 1 ? focusable[1] : contentRef.current)?.focus()
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
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
        onClick={onClose}
        onKeyDown={handleKeyDown}
      >
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className={cn(
            'flex max-h-[88%] w-full flex-col overflow-hidden rounded-sm bg-[var(--bg-surface)] text-[var(--fg)] shadow-xl outline-none',
            'animate-in slide-in-from-bottom-8 fade-in duration-200',
            'sm:max-h-[82%] sm:w-[min(520px,88%)] sm:border sm:border-[var(--border-raised)] sm:animate-in sm:fade-in sm:zoom-in-95 sm:slide-in-from-bottom-0',
          )}
          onClick={(event) => event.stopPropagation()}
          ref={(node) => {
            contentRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          role="dialog"
          tabIndex={-1}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border-row)] px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-[var(--fg)]" id={titleId}>
                {title}
              </h2>
              {description ? (
                <p className={cn('mt-1 font-mono text-xs', variant === 'destructive' ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)]')}>
                  {description}
                </p>
              ) : null}
            </div>
            <button
              aria-label="Close dialog"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-[var(--fg-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--fg)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-row)] px-5 py-4">
            <Button onClick={onClose} variant="outline">
              {cancelLabel}
            </Button>
            <Button className={cn(dialogConfirmVariants({ variant }))} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  },
)
Dialog.displayName = 'Dialog'

export { Dialog }
