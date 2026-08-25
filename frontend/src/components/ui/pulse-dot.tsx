import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const pulseDotVariants = cva('inline-block shrink-0', {
  variants: {
    tone: {
      live: 'bg-[var(--status-live)]',
      accent: 'bg-[var(--accent)]',
      offline: 'bg-[var(--fg-dim)]',
    },
  },
  defaultVariants: {
    tone: 'live',
  },
})

export interface PulseDotProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pulseDotVariants> {
  /** Oldalhossz px-ben. */
  size?: number
  /** Ciklusidő másodpercben. */
  speed?: number
  /** Ha false, statikus pötty animáció nélkül, teljes opacitáson. */
  animated?: boolean
}

function PulseDot({
  className,
  tone,
  size = 6,
  speed = 2.4,
  animated = true,
  ...props
}: PulseDotProps) {
  return (
    <span
      className={cn(pulseDotVariants({ tone }), className)}
      style={
        animated
          ? {
              width: size,
              height: size,
              animation: `swarmPulse ${speed}s ease-in-out infinite`,
            }
          : { width: size, height: size }
      }
      {...props}
    />
  )
}

export { PulseDot }
