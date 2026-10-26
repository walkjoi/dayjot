import { useDailyMoods } from '@/hooks/use-stats'
import { usePickedDayValue, type PickedDayValue } from '@/hooks/use-picked-day-value'

/**
 * The mood rating of the daily note for `date` (null when unrated), as the
 * index reads its `mood:` frontmatter — with a rating picked in the daily
 * mood bar shown at once until the index catches up.
 */
export function useDayMood(date: string): PickedDayValue<number | null> {
  const indexed = useDailyMoods().find((mood) => mood.date === date)?.rating ?? null
  return usePickedDayValue(date, indexed)
}
