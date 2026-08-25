import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full min-w-[640px] border-collapse text-left text-xs text-[var(--fg)]', className)}
        ref={ref}
        {...props}
      />
    </div>
  ),
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead className={cn(className)} ref={ref} {...props} />,
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody className={cn(className)} ref={ref} {...props} />,
)
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      className={cn('border-b border-[var(--border-row)] transition-colors hover:bg-white/[0.02]', className)}
      ref={ref}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      className={cn(
        'border-b-2 border-[var(--border)] px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

const tableCellVariants = cva('px-3 py-2.5 align-middle', {
  variants: {
    variant: {
      text: '',
      mono: 'font-mono text-xs text-[var(--fg-muted)]',
      badge: '',
      bar: '',
      thumb: '',
      actions: '',
    },
  },
  defaultVariants: {
    variant: 'text',
  },
})

export interface TableCellProps
  extends React.TdHTMLAttributes<HTMLTableCellElement>,
    VariantProps<typeof tableCellVariants> {
  value?: number
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, variant, value, children, ...props }, ref) => {
    return (
      <td className={cn(tableCellVariants({ variant }), className)} ref={ref} {...props}>
        {variant === 'badge' ? (
          <span className="inline-flex items-center rounded-sm border border-[var(--border-raised)] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
            {children}
          </span>
        ) : variant === 'bar' ? (
          <div aria-hidden="true" className="h-1.5 w-full min-w-[80px] max-w-[160px] overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full bg-[var(--status-live)] transition-all"
              style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
            />
          </div>
        ) : variant === 'thumb' ? (
          <div className="h-[50px] w-[88px] overflow-hidden rounded-sm border border-[var(--border-row)] bg-black/40">
            {children}
          </div>
        ) : variant === 'actions' ? (
          <div className="flex items-center justify-end gap-2">{children}</div>
        ) : (
          children
        )}
      </td>
    )
  },
)
TableCell.displayName = 'TableCell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
