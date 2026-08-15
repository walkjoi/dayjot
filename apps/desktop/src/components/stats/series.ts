import type { DailyWeight, DailyWordCount } from '@dayjot/core'

/**
 * Pure series shaping for the Stats charts. Day arithmetic runs on UTC day
 * numbers derived from the ISO date strings, so a DST transition never
 * stretches or shrinks a "day" — dates in, dates out.
 */

const DAY_MS = 86_400_000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The ISO date's UTC day number (NaN for a non-date string). */
export function dayNumberFromIso(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS
}

/** The ISO date for a UTC day number. */
export function isoFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** A short axis/tooltip label (`Aug 14`), timezone-proof via UTC parts. */
export function formatDayShort(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return `${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCDate()}`
}

/** The ISO date `days - 1` days before `today` — the first day of an N-day range. */
export function rangeStartIso(today: string, days: number): string {
  return isoFromDayNumber(dayNumberFromIso(today) - (days - 1))
}

/** One plotted weight point: the raw value plus its trailing 7-day mean. */
export interface WeightPoint extends DailyWeight {
  /** UTC day number — the numeric x value, so gaps keep their true width. */
  day: number
  /** Mean of the entries within the trailing 7 calendar days (this one included). */
  average: number
}

/**
 * Shape the per-day weight series for the chart: a numeric day axis and a
 * trailing 7-calendar-day moving average. Daily weigh-ins are noisy; the
 * average line is the trend. Input is ascending by date (the query's order).
 */
export function buildWeightPoints(series: readonly DailyWeight[]): WeightPoint[] {
  const days = series.map((point) => dayNumberFromIso(point.date))
  return series.map((point, index) => {
    const windowStart = days[index]! - 6
    let sum = 0
    let count = 0
    for (let cursor = index; cursor >= 0 && days[cursor]! >= windowStart; cursor -= 1) {
      sum += series[cursor]!.kg
      count += 1
    }
    return { ...point, day: days[index]!, average: sum / count }
  })
}

/**
 * Every day in `[start, end]` with its word count, missing days filled with
 * zero — a day without a note is a day nothing was written, and the bar chart
 * should say so rather than compress the timeline.
 */
export function fillMissingDays(
  series: readonly DailyWordCount[],
  start: string,
  end: string,
): DailyWordCount[] {
  const byDate = new Map(series.map((point) => [point.date, point.words]))
  const filled: DailyWordCount[] = []
  const lastDay = dayNumberFromIso(end)
  for (let day = dayNumberFromIso(start); day <= lastDay; day += 1) {
    const date = isoFromDayNumber(day)
    filled.push({ date, words: byDate.get(date) ?? 0 })
  }
  return filled
}
