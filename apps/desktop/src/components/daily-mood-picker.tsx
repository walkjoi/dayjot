import type { ReactElement } from 'react'
import { dailyPath, errorMessage, MOOD_SCALE } from '@dayjot/core'
import { moodFillClass } from '@/components/stats/mood-fill'
import { useDayMood } from '@/hooks/use-day-mood'
import { rateDailyNote } from '@/lib/note-mood'
import { startOperation } from '@/lib/operations'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'

interface DailyMoodPickerProps {
  /** The daily note's ISO date. */
  date: string
}

/**
 * The bar pinned to the foot of a daily note's canvas for rating the day,
 * Awful → Great, in one click: picking sets the note's `mood:` frontmatter —
 * the file stays the record, but the rating never shows in the note's text —
 * and picking the shown rating again clears it. Days still ahead have
 * nothing to rate, so a future day shows no bar.
 */
export function DailyMoodPicker({ date }: DailyMoodPickerProps): ReactElement | null {
  const today = useToday()
  const { graph } = useGraph()
  const { value: rating, showPicked, forgetPicked } = useDayMood(date)

  if (date > today) {
    return null
  }

  async function pick(next: number | null): Promise<void> {
    const generation = graph?.generation
    if (generation === undefined) {
      return
    }
    showPicked(next)
    try {
      await rateDailyNote(dailyPath(date), next, generation)
    } catch (cause) {
      forgetPicked()
      startOperation('Saving mood').fail(errorMessage(cause))
    }
  }

  return (
    <div
      role="group"
      aria-label="Mood"
      className="dayjot-content-gutter flex flex-none flex-wrap items-center gap-1 border-t border-border bg-surface py-2 text-xs text-text-muted"
    >
      <span className="mr-1">{date === today ? 'How was today?' : 'How was this day?'}</span>
      {MOOD_SCALE.map((point) => {
        const selected = rating === point.rating
        return (
          <button
            key={point.rating}
            type="button"
            aria-pressed={selected}
            onClick={() => void pick(selected ? null : point.rating)}
            className={cn(
              'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors duration-100',
              selected
                ? 'bg-accent-soft text-accent-soft-text'
                : 'hover:bg-surface-hover hover:text-text',
            )}
          >
            <span aria-hidden className={cn('size-2 rounded-[2px]', moodFillClass(point.rating))} />
            {point.label}
          </button>
        )
      })}
    </div>
  )
}
