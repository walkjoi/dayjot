import { differenceInCalendarDays } from 'date-fns'
import { addDaysIso, parseIsoDate } from './dates'

/**
 * The mobile day carousel's virtual window (Plan 19): a **fixed**
 * chronological range of days around an anchor, indexed `0 … count-1` from
 * oldest to newest. Virtual slides are free until mounted, so a generous
 * static window sidesteps bidirectional infinite scroll's prepend/scroll-
 * compensation problem entirely. Index↔date is pure offset math; a date
 * outside the window reports `-1` from {@link indexWithin}, the carousel's
 * signal to re-anchor around the far date.
 */

/** How far the window reaches either side of its anchor day. */
export interface DayWindowRadius {
  /** Days before the anchor — index 0 is `anchor - past`. */
  past: number
  /** Days after the anchor — the last index is `anchor + future`. */
  future: number
}

export interface DayWindow {
  /** ISO date of index 0 (the oldest day in the window). */
  start: string
  /** Total number of days (virtual slides). */
  count: number
  /** Index of the anchor day (the date the window was built around). */
  anchorIndex: number
}

/**
 * Build the window around `anchor`, reaching `past` days back and `future`
 * days forward. Stable for the life of the view.
 */
export function createDayWindow(
  anchor: string,
  { past, future }: DayWindowRadius,
): DayWindow {
  return {
    start: addDaysIso(anchor, -past),
    count: past + future + 1,
    anchorIndex: past,
  }
}

/** The ISO date at `index` (0 = oldest). */
export function dateAtIndex(window: DayWindow, index: number): string {
  return addDaysIso(window.start, index)
}

/**
 * The index of `date` within the window, or `-1` when it lies outside. The
 * mobile carousel uses the `-1` as its signal to re-anchor the window around a
 * far date link rather than scroll to an edge.
 */
export function indexWithin(window: DayWindow, date: string): number {
  const index = differenceInCalendarDays(parseIsoDate(date), parseIsoDate(window.start))
  return index >= 0 && index < window.count ? index : -1
}
