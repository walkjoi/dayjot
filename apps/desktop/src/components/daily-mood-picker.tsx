import type { ReactElement } from 'react'
import { dailyPath, errorMessage, MOOD_SCALE } from '@dayjot/core'
import { moodFillClass } from '@/components/stats/mood-fill'
import { useDayMood } from '@/hooks/use-day-mood'
import { useDayPeriod } from '@/hooks/use-day-period'
import { rateDailyNote } from '@/lib/note-mood'
import { markPeriodDay } from '@/lib/note-period'
import { startOperation } from '@/lib/operations'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'

interface DailyMoodPickerProps {
  /** The daily note's ISO date. */
  date: string
}

const CHOICE_CLASS =
  'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors duration-100'
const CHOICE_STATE_CLASS = {
  pressed: 'bg-accent-soft text-accent-soft-text',
  resting: 'hover:bg-surface-hover hover:text-text',
} as const

/**
 * The bar pinned to the foot of a daily note's canvas for logging the day in
 * one click: the mood, Awful → Great, and — at the far end — whether it was
 * a period day. Both land in the note's frontmatter (`mood: 4`,
 * `period: true`), so the file stays the record but nothing shows in the
 * note's text; picking the shown rating again, or flipping the toggle back,
 * clears it. Days still ahead have nothing to log, so a future day shows no
 * bar.
 */
export function DailyMoodPicker({ date }: DailyMoodPickerProps): ReactElement | null {
  const today = useToday()
  const { graph } = useGraph()
  const mood = useDayMood(date)
  const period = useDayPeriod(date)

  if (date > today) {
    return null
  }

  async function pickMood(next: number | null): Promise<void> {
    const generation = graph?.generation
    if (generation === undefined) {
      return
    }
    mood.showPicked(next)
    try {
      await rateDailyNote(dailyPath(date), next, generation)
    } catch (cause) {
      mood.forgetPicked()
      startOperation('Saving mood').fail(errorMessage(cause))
    }
  }

  async function togglePeriod(next: boolean): Promise<void> {
    const generation = graph?.generation
    if (generation === undefined) {
      return
    }
    period.showPicked(next)
    try {
      await markPeriodDay(dailyPath(date), next, generation)
    } catch (cause) {
      period.forgetPicked()
      startOperation('Saving period day').fail(errorMessage(cause))
    }
  }

  return (
    <div className="dayjot-content-gutter flex flex-none flex-wrap items-center gap-1 border-t border-border bg-surface py-2 text-xs text-text-muted">
      <div role="group" aria-label="Mood" className="flex flex-wrap items-center gap-1">
        <span className="mr-1">{date === today ? 'How was today?' : 'How was this day?'}</span>
        {MOOD_SCALE.map((point) => {
          const selected = mood.value === point.rating
          return (
            <button
              key={point.rating}
              type="button"
              aria-pressed={selected}
              onClick={() => void pickMood(selected ? null : point.rating)}
              className={cn(CHOICE_CLASS, CHOICE_STATE_CLASS[selected ? 'pressed' : 'resting'])}
            >
              <span aria-hidden className={cn('size-2 rounded-[2px]', moodFillClass(point.rating))} />
              {point.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        aria-pressed={period.value}
        onClick={() => void togglePeriod(!period.value)}
        className={cn(CHOICE_CLASS, 'ml-auto', CHOICE_STATE_CLASS[period.value ? 'pressed' : 'resting'])}
      >
        <span aria-hidden className="size-2 rounded-full bg-(--period)" />
        Period
      </button>
    </div>
  )
}
