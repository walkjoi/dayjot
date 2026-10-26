import { parseIsoUtc } from '@dayjot/utils'

/**
 * Menstrual-cycle arithmetic over the days a daily note flagged `period: true`
 * (Stats page). Day arithmetic runs on UTC day numbers, like streaks, so a
 * DST transition never stretches a day. This is a log, not a forecast: it
 * reports what the notes recorded and predicts nothing.
 */

const DAY_MS = 86_400_000

// Marked days at most this far apart belong to one period: a single day left
// unlogged in the middle of a period must not split it in two.
const SAME_PERIOD_GAP_DAYS = 2

// Start-to-start lengths outside this range are almost certainly logging
// artifacts (a period never marked, a stray mark), so they stay out of the
// average rather than skewing it. A cycle day past the upper bound has the
// same problem, so it goes unreported.
const PLAUSIBLE_CYCLE_DAYS = { min: 15, max: 60 } as const

// The average describes recent cycles, not a lifetime.
const RECENT_CYCLES = 6

function dayNumber(date: string): number {
  return parseIsoUtc(date).getTime() / DAY_MS
}

/** One period: a run of marked days, gaps of one unlogged day bridged. */
export interface Period {
  /** ISO date of the first marked day. */
  start: string
  /** ISO date of the last marked day. */
  end: string
  /** Calendar days from start to end, both included. */
  days: number
}

export interface CycleSummary {
  /** Every period on or before today, ascending. */
  periods: Period[]
  /**
   * Today's day in the current cycle — 1 on the latest period's first day —
   * or null when nothing was logged, or the latest start is too long ago for
   * the count to mean anything.
   */
  cycleDay: number | null
  /** Mean start-to-start length of the recent plausible cycles, rounded; null with none. */
  averageCycleDays: number | null
  /** How many cycles {@link averageCycleDays} averages. */
  cyclesAveraged: number
}

/**
 * Group the marked days (any order, duplicates tolerated) into periods and
 * summarize the cycles between them, anchored at `today`. Marks dated after
 * today are ignored — a future day can't have been a period day yet.
 */
export function summarizeCycles(periodDays: readonly string[], today: string): CycleSummary {
  const todayNumber = dayNumber(today)
  const days = [...new Set(periodDays)]
    .map((date) => ({ date, day: dayNumber(date) }))
    .filter((entry) => Number.isFinite(entry.day) && entry.day <= todayNumber)
    .sort((first, second) => first.day - second.day)

  const runs: Array<{ start: (typeof days)[number]; end: (typeof days)[number] }> = []
  for (const entry of days) {
    const last = runs.at(-1)
    if (last !== undefined && entry.day - last.end.day <= SAME_PERIOD_GAP_DAYS) {
      last.end = entry
    } else {
      runs.push({ start: entry, end: entry })
    }
  }

  const periods = runs.map((run) => ({
    start: run.start.date,
    end: run.end.date,
    days: run.end.day - run.start.day + 1,
  }))

  const lengths = runs
    .slice(1)
    .map((run, index) => run.start.day - runs[index]!.start.day)
    .filter((length) => length >= PLAUSIBLE_CYCLE_DAYS.min && length <= PLAUSIBLE_CYCLE_DAYS.max)
    .slice(-RECENT_CYCLES)
  const averageCycleDays =
    lengths.length === 0
      ? null
      : Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length)

  const latest = runs.at(-1)
  const sinceStart = latest === undefined ? null : todayNumber - latest.start.day + 1
  const cycleDay = sinceStart !== null && sinceStart <= PLAUSIBLE_CYCLE_DAYS.max ? sinceStart : null

  return { periods, cycleDay, averageCycleDays, cyclesAveraged: lengths.length }
}
