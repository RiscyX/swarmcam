import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className={cn(
          'h-11 w-full appearance-none rounded-sm border border-[var(--border)] bg-[var(--bg-input)] px-3 pr-9 text-sm text-foreground',
          'focus:border-[var(--accent)] focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]"
      />
    </div>
  ),
)
Select.displayName = 'Select'

export { Select }
