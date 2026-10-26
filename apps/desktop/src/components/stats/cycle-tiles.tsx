import { useMemo, type ReactElement } from 'react'
import { summarizeCycles } from '@dayjot/core'
import { formatDayShort } from './series'
import { StatTile } from './stat-tile'

interface CycleTilesProps {
  /** Every day flagged `period: true`, ascending (the row is not rendered when empty). */
  periodDays: readonly string[]
  /** Today's ISO date — the cycle day counts up to it. */
  today: string
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * The cycle at a glance, read straight from the marked days: today's day in
 * the current cycle, the recent average cycle length, and the last period.
 * A log, not a forecast — nothing here predicts the next one.
 */
export function CycleTiles({ periodDays, today }: CycleTilesProps): ReactElement {
  const summary = useMemo(() => summarizeCycles(periodDays, today), [periodDays, today])
  const last = summary.periods.at(-1)

  return (
    <section aria-label="Cycle" className="grid grid-cols-3 gap-4">
      <StatTile
        label="Cycle day"
        value={summary.cycleDay === null ? '—' : String(summary.cycleDay)}
        detail={
          last === undefined
            ? 'no period yet'
            : `${summary.cycleDay === null ? 'last began' : 'since'} ${formatDayShort(last.start)}`
        }
      />
      <StatTile
        label="Average cycle"
        value={summary.averageCycleDays === null ? '—' : String(summary.averageCycleDays)}
        detail={
          summary.averageCycleDays === null
            ? 'after two periods'
            : `days · last ${plural(summary.cyclesAveraged, 'cycle')}`
        }
      />
      <StatTile
        label="Last period"
        value={last === undefined ? '—' : String(last.days)}
        detail={
          last === undefined
            ? 'no period yet'
            : `${last.days === 1 ? 'day' : 'days'} · ${formatDayShort(last.start)}${
                last.days === 1 ? '' : `–${formatDayShort(last.end)}`
              }`
        }
      />
    </section>
  )
}
