import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { MOOD_SCALE, type DailyMood } from '@dayjot/core'
import { ChevronLeftIcon } from '@/components/icons/chevron-left-icon'
import { ChevronRightIcon } from '@/components/icons/chevron-right-icon'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation'
import { formatDayLabel } from '@/lib/dates'
import { monthOf, monthShortLabel } from '@/lib/month-grid'
import { cn } from '@/lib/utils'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { useSettings } from '@/providers/settings-provider'
import { moodFillClass } from './mood-fill'
import { MoodPixel } from './mood-pixel'
import {
  buildYearRows,
  DAYS_PER_ROW,
  initialPixel,
  isPixelMoveKey,
  movePixel,
  pixelYears,
  yearOf,
} from './year-pixels'

interface YearInPixelsProps {
  /** Every rated day, ascending (the section is not rendered when empty). */
  moods: readonly DailyMood[]
  /** Today's ISO date — the default year, the today ring, and the future fade. */
  today: string
}

const YEAR_BUTTON_CLASS =
  'cursor-default rounded-md transition-colors duration-100 hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-50'

// Column headers are labeled sparsely; a number over every column is noise.
const LABELED_DAYS = new Set([1, 5, 10, 15, 20, 25, 30])

const DAY_COLUMNS = Array.from({ length: DAYS_PER_ROW }, (_unused, index) => index + 1)

/**
 * The Year in Pixels: every day of one year as a square, months as rows and
 * days-of-month as columns, filled by that day's `mood:` rating. The grid is
 * one tab stop; arrow keys move between days, Enter opens the day's note.
 */
export function YearInPixels({ moods, today }: YearInPixelsProps): ReactElement {
  const { settings } = useSettings()
  const navigateNoteLink = useNoteLinkNavigation()
  const gridRef = useRef<HTMLDivElement>(null)

  const years = useMemo(() => pixelYears(moods.map((mood) => mood.date), today), [moods, today])
  const [year, setYear] = useState(() => yearOf(today))
  const [activeDate, setActiveDate] = useState(() => initialPixel(yearOf(today), today))

  const rows = useMemo(() => buildYearRows(year), [year])
  const ratings = useMemo(() => new Map(moods.map((mood) => [mood.date, mood.rating])), [moods])
  const ratedInYear = useMemo(
    () => moods.filter((mood) => yearOf(mood.date) === year).length,
    [moods, year],
  )
  const dayLabels = useMemo(
    () =>
      new Map(
        rows.flatMap((row) => row.dates.map((date) => [date, formatDayLabel(date, settings.dateFormat)])),
      ),
    [rows, settings.dateFormat],
  )

  const tabStop = yearOf(activeDate) === year ? activeDate : initialPixel(year, today)
  const yearIndex = years.indexOf(year)

  const showYear = (next: number): void => {
    setYear(next)
    setActiveDate(initialPixel(next, today))
  }

  const openDay = useCallback(
    (date: string, event: NewWindowClickEvent) => navigateNoteLink({ kind: 'daily', date }, event),
    [navigateNoteLink],
  )

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!isPixelMoveKey(event.key)) {
      return
    }
    event.preventDefault()
    const next = movePixel(tabStop, event.key)
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus()
  }

  return (
    <section
      aria-label="Year in Pixels"
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium text-text">Year in Pixels</h2>
          <span className="text-xs tabular-nums text-text-muted">
            {`${ratedInYear} ${ratedInYear === 1 ? 'day' : 'days'} rated`}
          </span>
        </div>
        <nav aria-label="Year" className="flex items-center gap-1 text-text-muted">
          <button
            type="button"
            aria-label="Previous year"
            disabled={yearIndex <= 0}
            onClick={() => showYear(year - 1)}
            className={YEAR_BUTTON_CLASS}
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <span className="text-sm tabular-nums text-text-secondary">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            disabled={yearIndex === -1 || yearIndex >= years.length - 1}
            onClick={() => showYear(year + 1)}
            className={YEAR_BUTTON_CLASS}
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </nav>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`Mood by day, ${year}`}
        onKeyDown={onGridKeyDown}
        className="mt-3 grid gap-0.5"
        style={{ gridTemplateColumns: `2rem repeat(${DAYS_PER_ROW}, minmax(0, 1fr))` }}
      >
        <div role="row" className="contents">
          <div role="columnheader" aria-label="Month" />
          {DAY_COLUMNS.map((day) => (
            <div
              key={day}
              role="columnheader"
              aria-label={`Day ${day}`}
              className="text-center text-2xs leading-4 tabular-nums text-text-muted"
            >
              {LABELED_DAYS.has(day) ? day : ''}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.month} role="row" className="contents">
            <div role="rowheader" className="self-center text-2xs text-text-muted">
              {monthShortLabel(monthOf(row.dates[0]!))}
            </div>
            {row.dates.map((date) => (
              <MoodPixel
                key={date}
                date={date}
                rating={ratings.get(date)}
                dayLabel={dayLabels.get(date) ?? date}
                isToday={date === today}
                isFuture={date > today}
                isActive={date === tabStop}
                onOpen={openDay}
                onFocusDay={setActiveDate}
              />
            ))}
            {/* Short months keep their row: placeholders hold the grid columns. */}
            {DAY_COLUMNS.slice(row.dates.length).map((day) => (
              <div key={`pad-${day}`} aria-hidden />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 text-2xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-[2px]', moodFillClass(null))} />
          Not rated
        </span>
        <span className="flex items-center gap-1.5">
          {MOOD_SCALE[0].label}
          {MOOD_SCALE.map((point) => (
            <span
              key={point.rating}
              aria-hidden
              className={cn('size-2.5 rounded-[2px]', moodFillClass(point.rating))}
            />
          ))}
          {MOOD_SCALE[4].label}
        </span>
      </div>
    </section>
  )
}
