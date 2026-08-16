import type { ReactElement } from 'react'
import { formatDayShort, formatKg, weightPointFromTooltip } from './series'

interface WeightTooltipProps {
  active?: boolean | undefined
  payload?: ReadonlyArray<{ payload?: unknown }> | undefined
}

/**
 * Purpose-built tooltip for the weight chart. The generic shadcn
 * `ChartTooltipContent` renders one row per payload entry — and a `Scatter`
 * on a numeric axis contributes its x value (the internal UTC day number) as
 * an extra entry, which showed up as a nonsense "day 20679.0 kg" row. Both
 * real rows come from one data point, so this reads that point once and
 * renders exactly the rows that mean something: the date, the day's weight,
 * and the trailing 7-day average.
 */
export function WeightTooltip({ active, payload }: WeightTooltipProps): ReactElement | null {
  const point = weightPointFromTooltip(payload)
  if (active !== true || point === null) {
    return null
  }
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{formatDayShort(point.date)}</div>
      <div className="flex w-full items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-(--color-kg)" />
          <span className="text-muted-foreground">Weight</span>
        </span>
        <span className="font-mono tabular-nums">{formatKg(point.kg)}</span>
      </div>
      <div className="flex w-full items-center justify-between gap-4">
        <span className="text-muted-foreground">7-day avg</span>
        <span className="font-mono tabular-nums">{formatKg(point.average)}</span>
      </div>
    </div>
  )
}
