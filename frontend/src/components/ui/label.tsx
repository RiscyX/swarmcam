import * as React from 'react'

import { cn } from '@/lib/utils'

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]',
        className,
      )}
      {...props}
    />
  ),
)
Label.displayName = 'Label'

export { Label }
