import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const emptyStateVariants = cva(
  'flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-8 text-center',
  {
    variants: {
      variant: {
        empty: 'border-[var(--border-raised)]',
        error: 'border-[var(--accent)]',
      },
    },
    defaultVariants: {
      variant: 'empty',
    },
  },
)

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({ className, variant, icon, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ variant }), className)} {...props}>
      {icon ? <div className="text-[var(--fg-muted)]">{icon}</div> : null}
      <div className="text-sm font-bold text-foreground">{title}</div>
      {description ? <p className="max-w-sm text-xs text-[var(--fg-muted)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
