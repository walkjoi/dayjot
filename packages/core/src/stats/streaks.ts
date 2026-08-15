/**
 * Daily-note streaks over ISO `YYYY-MM-DD` dates (Stats page). Day arithmetic
 * runs on UTC day numbers, so a DST transition never produces a 23/25-hour
 * "day" that breaks adjacency — the calendar keys are plain date strings.
 */

const DAY_MS = 86_400_000

/** The date's UTC day number, or NaN for a non-date string. */
function utcDayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS
}

export interface Streaks {
  /**
   * Consecutive days written, ending today or yesterday — a day whose note
   * isn't written *yet* doesn't break the streak at midnight.
   */
  current: number
  /** The longest run of consecutive days anywhere in the history. */
  longest: number
}

/**
 * Compute streaks from the indexed daily-note dates (any order, duplicates
 * tolerated) anchored at `today` (the viewer's local calendar date).
 */
export function computeStreaks(dates: readonly string[], today: string): Streaks {
  const days = [...new Set(dates)]
    .map(utcDayNumber)
    .filter((day) => Number.isFinite(day))
    .sort((first, second) => first - second)

  let longest = 0
  let run = 0
  let previous: number | null = null
  const runEndingAt = new Map<number, number>()
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    runEndingAt.set(day, run)
    longest = Math.max(longest, run)
    previous = day
  }

  const todayNumber = utcDayNumber(today)
  const current = runEndingAt.get(todayNumber) ?? runEndingAt.get(todayNumber - 1) ?? 0
  return { current, longest }
}
