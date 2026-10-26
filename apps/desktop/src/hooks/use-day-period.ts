import { usePeriodDays } from '@/hooks/use-stats'
import { usePickedDayValue, type PickedDayValue } from '@/hooks/use-picked-day-value'

/**
 * Whether the daily note for `date` marks a period day, as the index reads
 * its `period:` frontmatter — with a flip of the daily bar's toggle shown at
 * once until the index catches up.
 */
export function useDayPeriod(date: string): PickedDayValue<boolean> {
  return usePickedDayValue(date, usePeriodDays().includes(date))
}
