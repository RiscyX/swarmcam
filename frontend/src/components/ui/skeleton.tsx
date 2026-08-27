import * as React from 'react'

import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-[swarmShimmer_1.4s_linear_infinite] rounded-sm bg-[length:300px_100%] bg-[linear-gradient(90deg,var(--skeleton-base),var(--skeleton-hi),var(--skeleton-base))]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
