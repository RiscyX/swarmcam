import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const statusPillVariants = cva(
  'inline-flex items-center rounded-sm border px-[7px] py-[3px] font-mono text-[10px] uppercase tracking-[0.12em]',
  {
    variants: {
      tone: {
        live: 'border-[color-mix(in_srgb,var(--status-live)_33%,transparent)] text-[var(--status-live)]',
        idle: 'border-[color-mix(in_srgb,var(--status-idle)_33%,transparent)] text-[var(--status-idle)]',
        offline:
          'border-[color-mix(in_srgb,var(--status-offline)_33%,transparent)] text-[var(--status-offline)]',
        admin: 'border-[color-mix(in_srgb,var(--status-admin)_33%,transparent)] text-[var(--status-admin)]',
      },
    },
    defaultVariants: {
      tone: 'idle',
    },
  },
)

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {}

function StatusPill({ className, tone, ...props }: StatusPillProps) {
  return <span className={cn(statusPillVariants({ tone }), className)} {...props} />
}

export { StatusPill }
