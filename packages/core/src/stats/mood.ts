/**
 * The mood scale a daily note's `mood:` frontmatter rates the day on: five
 * points, Awful (1) to Great (5). An unrated day has no key at all, which is
 * why the scale has no zero — "nothing logged" and "the worst day" must never
 * look alike.
 */
export const MOOD_SCALE = [
  { rating: 1, label: 'Awful' },
  { rating: 2, label: 'Bad' },
  { rating: 3, label: 'Okay' },
  { rating: 4, label: 'Good' },
  { rating: 5, label: 'Great' },
] as const

/** One point on {@link MOOD_SCALE}. */
export type MoodRating = (typeof MOOD_SCALE)[number]['rating']

/** Is `value` a rating on the scale (an integer from 1 to 5)? */
export function isMoodRating(value: number): value is MoodRating {
  return MOOD_SCALE.some((point) => point.rating === value)
}

/** The scale's word for `rating` (`4` → `Good`), or null off the scale. */
export function moodLabel(rating: number): string | null {
  return MOOD_SCALE.find((point) => point.rating === rating)?.label ?? null
}
