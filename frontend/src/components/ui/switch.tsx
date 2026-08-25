import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      ref={ref}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'inline-flex h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'relative h-[22px] w-10 rounded-sm transition-colors duration-150',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
        )}
      >
        <span
          className={cn(
            'absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-sm transition-transform duration-150',
            checked ? 'translate-x-[18px] bg-background' : 'translate-x-0 bg-[var(--fg-muted)]',
          )}
        />
      </span>
    </button>
  ),
)
Switch.displayName = 'Switch'

export { Switch }
