import { addDaysIso, addMonthsIso, isoFromParts } from '@/lib/dates'

/**
 * Pure layout and navigation for the Year in Pixels: one row per month, one
 * column per day-of-month (1–31). Dates are ISO strings throughout and all
 * arithmetic is the shared UTC calendar math, so the grid never depends on
 * the local clock or a DST transition.
 */

/** Columns in every month row — the longest month. */
export const DAYS_PER_ROW = 31

/** Days in `month` (1–12) of `year`, leap years included. */
export function daysInMonth(year: number, month: number): number {
  const lastDay = addDaysIso(addMonthsIso(isoFromParts(year, month, 1), 1), -1)
  return Number(lastDay.slice(8, 10))
}

/** One month row: its number (1–12) and its real dates, day 1 first. */
export interface PixelMonth {
  month: number
  dates: string[]
}

/** The year's twelve month rows; a row holds only the days its month has. */
export function buildYearRows(year: number): PixelMonth[] {
  return Array.from({ length: 12 }, (_unused, index) => {
    const month = index + 1
    const dates = Array.from({ length: daysInMonth(year, month) }, (_day, day) =>
      isoFromParts(year, month, day + 1),
    )
    return { month, dates }
  })
}

/** The year an ISO date falls in. */
export function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

/**
 * The years the year switcher steps through, ascending: from the earliest
 * rated year to the later of today's year and the last rated one, so a year
 * with no ratings between two that have them is still reachable.
 */
export function pixelYears(ratedDates: readonly string[], today: string): number[] {
  const todayYear = yearOf(today)
  const years = ratedDates.map(yearOf).filter((year) => Number.isFinite(year))
  const first = Math.min(todayYear, ...years)
  const last = Math.max(todayYear, ...years)
  return Array.from({ length: last - first + 1 }, (_unused, index) => first + index)
}

/** The keys that move focus inside the grid. */
export type PixelMoveKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

/** Narrows a `KeyboardEvent.key` to one the grid moves on. */
export function isPixelMoveKey(key: string): key is PixelMoveKey {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)
}

/**
 * Where focus lands after `key` from `date`, clamped to `date`'s year.
 * Left/right step one calendar day (crossing into the next row at a month's
 * end), up/down keep the day-of-month in the adjacent month (clamped to that
 * month's length), and Home/End jump to the row's first and last day.
 */
export function movePixel(date: string, key: PixelMoveKey): string {
  const year = yearOf(date)
  const month = Number(date.slice(5, 7))
  const clampToYear = (candidate: string): string => (yearOf(candidate) === year ? candidate : date)

  switch (key) {
    case 'ArrowLeft':
      return clampToYear(addDaysIso(date, -1))
    case 'ArrowRight':
      return clampToYear(addDaysIso(date, 1))
    case 'ArrowUp':
      return clampToYear(addMonthsIso(date, -1))
    case 'ArrowDown':
      return clampToYear(addMonthsIso(date, 1))
    case 'Home':
      return isoFromParts(year, month, 1)
    case 'End':
      return isoFromParts(year, month, daysInMonth(year, month))
  }
}

/**
 * The cell that holds the grid's single tab stop when focus enters it: today
 * when today is in the shown year, else that year's first day.
 */
export function initialPixel(year: number, today: string): string {
  return yearOf(today) === year ? today : isoFromParts(year, 1, 1)
}
