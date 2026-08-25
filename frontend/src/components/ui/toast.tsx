import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const toastVariants = cva(
  'relative cursor-pointer overflow-hidden rounded-sm border border-[var(--border-raised)] bg-[var(--bg-surface)] py-3 pl-5 pr-4 shadow-lg transition-opacity hover:opacity-90',
  {
    variants: {
      variant: {
        success: 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--status-live)]',
        error: 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]',
      },
    },
    defaultVariants: {
      variant: 'success',
    },
  },
)

export interface ToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  title: string
  detail?: string
  duration?: number
  onDismiss: () => void
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ title, detail, duration = 8000, onDismiss, variant, className, ...props }, ref) => {
    const onDismissRef = React.useRef(onDismiss)
    onDismissRef.current = onDismiss

    React.useEffect(() => {
      if (!duration || duration <= 0) return
      const timer = window.setTimeout(() => onDismissRef.current(), duration)
      return () => window.clearTimeout(timer)
    }, [duration])

    return (
      <div
        className={cn(toastVariants({ variant }), className)}
        onClick={onDismiss}
        ref={ref}
        role="status"
        {...props}
      >
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">{title}</p>
        {detail ? <p className="mt-1 font-mono text-xs text-[var(--fg-muted)]">{detail}</p> : null}
      </div>
    )
  },
)
Toast.displayName = 'Toast'

const ToastContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn('fixed right-5 top-16 z-30 grid w-80 gap-2', className)} ref={ref} {...props} />
  ),
)
ToastContainer.displayName = 'ToastContainer'

export { Toast, ToastContainer }
