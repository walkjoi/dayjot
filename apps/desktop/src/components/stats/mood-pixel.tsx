import { memo, type ReactElement } from 'react'
import { moodLabel } from '@dayjot/core'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { moodFillClass } from './mood-fill'

interface MoodPixelProps {
  date: string
  /** The day's rating, or undefined when it was never rated. */
  rating: number | undefined
  /** The day was flagged `period: true`. */
  isPeriodDay: boolean
  /** The day's label in the user's date format (tooltip and accessible name). */
  dayLabel: string
  isToday: boolean
  isFuture: boolean
  /** Holds the grid's one tab stop (roving tabindex). */
  isActive: boolean
  /** Opens the day's note (⌘-click: in a new window). */
  onOpen: (date: string, event: NewWindowClickEvent) => void
  onFocusDay: (date: string) => void
}

/**
 * One day of the Year in Pixels: a filled square for a rated day, a grey
 * wash for an unrated one, and a blue dot on a period day. Hover or keyboard
 * focus shows the date and what was logged; click or Enter opens the day's
 * note, whose mood bar changes both.
 */
export const MoodPixel = memo(function MoodPixel({
  date,
  rating,
  isPeriodDay,
  dayLabel,
  isToday,
  isFuture,
  isActive,
  onOpen,
  onFocusDay,
}: MoodPixelProps): ReactElement {
  const moodText = rating === undefined ? 'Not rated' : (moodLabel(rating) ?? 'Not rated')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="gridcell"
          tabIndex={isActive ? 0 : -1}
          data-date={date}
          aria-label={`${dayLabel}: ${moodText}${isPeriodDay ? ', period day' : ''}`}
          aria-current={isToday ? 'date' : undefined}
          onClick={(event) => onOpen(date, event)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(date, event)
            }
          }}
          onFocus={() => onFocusDay(date)}
          className={cn(
            'relative aspect-square cursor-default rounded-[3px] outline-none transition-opacity duration-100',
            'hover:opacity-75 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
            moodFillClass(rating ?? null),
            isFuture && rating === undefined && 'opacity-40',
            isToday && 'ring-1 ring-text-secondary ring-offset-1 ring-offset-surface',
          )}
        >
          {isPeriodDay ? (
            // A surface ring keeps the dot legible on every fill.
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--period) ring-2 ring-surface"
            />
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="font-medium">{dayLabel}</span>
        <span className="text-muted-foreground">
          {isPeriodDay ? `${moodText} · Period` : moodText}
        </span>
      </TooltipContent>
    </Tooltip>
  )
})
