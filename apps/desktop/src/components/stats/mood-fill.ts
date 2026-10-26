/**
 * The fill for each mood rating, as literal class names so Tailwind sees
 * them. The colors are the design system's `--mood-*` ramp; every surface
 * that shows a rating (the Year in Pixels, its legend, the daily picker)
 * reads them here so a rating looks the same wherever it appears.
 */
const MOOD_FILL: Readonly<Record<number, string>> = {
  1: 'bg-(--mood-1)',
  2: 'bg-(--mood-2)',
  3: 'bg-(--mood-3)',
  4: 'bg-(--mood-4)',
  5: 'bg-(--mood-5)',
}

/** The fill class for `rating`; anything off the scale is the unrated grey wash. */
export function moodFillClass(rating: number | null): string {
  return (rating === null ? undefined : MOOD_FILL[rating]) ?? 'bg-(--mood-none)'
}
