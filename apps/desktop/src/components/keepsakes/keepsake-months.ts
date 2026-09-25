import { keepsakeDate, type Keepsake } from '@dayjot/core'

/** One month's kept fragments, newest month first and newest fragment first. */
export interface KeepsakeMonth {
  /** `YYYY-MM` — the group's stable key. */
  key: string
  /** How the month rule reads, e.g. `September 2026`. */
  label: string
  keepsakes: Keepsake[]
}

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Parse an ISO day as a local date, so month grouping never slips a timezone. */
function localDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

/** How a fragment's own date reads beneath it, e.g. `9 Sep 2026`. */
export function keepsakeDayLabel(keepsake: Keepsake): string {
  return DAY_FORMAT.format(localDate(keepsakeDate(keepsake)))
}

/**
 * Group `keepsakes` (already newest first) into months — the box's default
 * division. It comes free from the dates the fragments already carry and says
 * something true of every one of them: how long ago this was. (The other
 * division, by subject, reads only what the writer chose to link.)
 */
export function groupKeepsakesByMonth(keepsakes: readonly Keepsake[]): KeepsakeMonth[] {
  const months: KeepsakeMonth[] = []
  for (const keepsake of keepsakes) {
    const date = keepsakeDate(keepsake)
    const key = date.slice(0, 'YYYY-MM'.length)
    const last = months[months.length - 1]
    if (last?.key === key) {
      last.keepsakes.push(keepsake)
      continue
    }
    months.push({ key, label: MONTH_FORMAT.format(localDate(date)), keepsakes: [keepsake] })
  }
  return months
}
