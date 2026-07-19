import { useEffect, useState, type ReactElement } from 'react'
import { dailyPath } from '@dayjot/core'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayCalendar } from '@/components/context-sidebar/day-calendar'
import { NotePane } from '@/components/note-pane'
import { NotePinButton } from '@/components/note-pin-button'
import { ShortcutKeys } from '@/components/shortcut-keys'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { keybindingFor } from '@/lib/commands/app-commands'
import { addDaysIso, formatDayLabel, todayIso } from '@/lib/dates'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { useSetFocusedDailyDate } from '@/providers/focused-daily-provider'
import { useSettings } from '@/providers/settings-provider'
import { useRouter } from '@/routing/router'
import { ScrollRestored } from '@/routing/scroll-restore'

interface DailyViewProps {
  /** The day to show, or the live local day for the `today` route. */
  target: { kind: 'today' } | { kind: 'date'; date: string }
}

/**
 * The daily canvas: exactly **one day on screen**. The heading names the day
 * (today tinted brand) with its pin and previous/next-day controls beside
 * it; the body is that day's note, nothing above or below it. Moving between
 * days is always an explicit navigation — the chevrons, the sidebar
 * calendar, ⌘D — never a scroll: the old virtualized stream let the canvas
 * drift across dates, which this view deliberately forbids.
 *
 * Arrival behavior carries over from the stream: every navigation arrival
 * focuses the day's editor once, capture arrivals (⌘D, the sidebar's Daily
 * notes row — the router's `arrivalFocusEditor`) with the caret at the end,
 * everything else at the note start. Back/forward (`entryId` without an
 * `arrivalSeq` bump) re-pins the shown day but never steals focus — history
 * moves restore scroll, not the caret. The `today` target reads the live
 * clock at arrival time — midnight alone is not a navigation; the next ⌘D
 * lands on the new day.
 */
export function DailyView({ target }: DailyViewProps): ReactElement {
  const { arrivalSeq, entryId, arrivalFocusEditor, navigate } = useRouter()
  // Live today drives the heading tint and where the chevrons route; the
  // *shown* day is pinned per arrival below, so midnight can't swap the
  // canvas under an open editor.
  const today = useToday()
  // `null` means "the live day at arrival time" (the today target).
  const targetDate = target.kind === 'date' ? target.date : null

  // The shown day and the once-per-arrival focus request, adjusted *during
  // render* when a new arrival lands (note-pane's seed pattern — only the
  // committed render's value survives). An `arrivalSeq` bump is a navigation:
  // re-pin the day and request focus (capture arrivals caret-at-end). An
  // `entryId`-only change is back/forward: re-pin the day but request no
  // focus — history moves restore scroll, not the caret. The focus request
  // is consumed when the editor actually mounts and focuses (not at render
  // time), so a lazy load can't drop it.
  const arrivalKey = `${arrivalSeq}:${entryId}`
  const [arrival, setArrival] = useState<{
    key: string
    seq: number
    date: string
    pendingFocus: 'start' | 'end' | null
  }>(() => ({
    key: arrivalKey,
    seq: arrivalSeq,
    date: targetDate ?? todayIso(),
    pendingFocus: arrivalFocusEditor ? 'end' : 'start',
  }))
  if (arrival.key !== arrivalKey) {
    setArrival({
      key: arrivalKey,
      seq: arrivalSeq,
      date: targetDate ?? todayIso(),
      pendingFocus:
        arrival.seq === arrivalSeq ? null : arrivalFocusEditor ? 'end' : 'start',
    })
  }
  const { date, pendingFocus } = arrival
  const isToday = date === today
  const { settings } = useSettings()
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Report the shown day as the focused day, keyed on the arrival so the
  // report re-fires after the workspace's pre-paint reset (a layout effect —
  // this passive effect runs later in the same commit and wins).
  const setFocusedDailyDate = useSetFocusedDailyDate()
  useEffect(() => {
    setFocusedDailyDate(date)
  }, [arrivalKey, date, setFocusedDailyDate])

  return (
    <ScrollRestored className="h-full overflow-auto px-0">
      <div className="mx-auto flex min-h-full w-full max-w-full flex-col py-8">
        <div className="dayjot-content-gutter group mb-3 flex items-center justify-between gap-2">
          <h2 className={cn('dayjot-daily-subject', isToday && 'text-accent')}>
            {formatDayLabel(date, settings.dateFormat)}
          </h2>
          <div className="flex items-center gap-1">
            {/* Wayfinding home: only rendered off today, always full-strength
                (unlike the quiet controls beside it) — the one-click way back
                that ⌘D provides invisibly. */}
            {!isToday ? (
              <button
                type="button"
                onClick={() => navigate({ kind: 'today' })}
                className="mr-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors duration-100 hover:bg-surface-hover hover:text-text"
              >
                Today
              </button>
            ) : null}
            {/* Reading chrome rests quiet; it sharpens on hover, on focus, or
                while the calendar is open, so a day you're only reading is a
                date and prose. */}
            <div
              className={cn(
                'flex items-center gap-1 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100',
                calendarOpen ? 'opacity-100' : 'opacity-40',
              )}
            >
              <NotePinButton path={dailyPath(date)} />
              {/* Jump to any date — the on-demand replacement for the old
                  always-open month calendar. */}
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Pick a date"
                    className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-secondary data-[state=open]:bg-surface-hover data-[state=open]:text-text-secondary"
                  >
                    <CalendarDays aria-hidden strokeWidth={1.75} className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-1">
                  <DayCalendar
                    selectedDate={date}
                    today={today}
                    onNavigate={() => setCalendarOpen(false)}
                  />
                </PopoverContent>
              </Popover>
              <DayChevron
                label="Previous day"
                binding={keybindingFor('day.previous')}
                onClick={() => navigate(routeForDay(addDaysIso(date, -1), today))}
              >
                <ChevronLeft aria-hidden strokeWidth={1.75} className="size-4" />
              </DayChevron>
              <DayChevron
                label="Next day"
                binding={keybindingFor('day.next')}
                onClick={() => navigate(routeForDay(addDaysIso(date, 1), today))}
              >
                <ChevronRight aria-hidden strokeWidth={1.75} className="size-4" />
              </DayChevron>
            </div>
          </div>
        </div>
        <NotePane
          path={dailyPath(date)}
          lazy
          autoFocus={pendingFocus !== null}
          autoFocusSelection={pendingFocus ?? 'start'}
          onAutoFocused={() =>
            setArrival((current) => ({ ...current, pendingFocus: null }))
          }
          className="flex grow flex-col"
          gutterClassName="dayjot-content-gutter"
          editorClassName="grow"
        />
      </div>
    </ScrollRestored>
  )
}

/** Selecting the live day routes `today` so the canvas keeps rolling over. */
function routeForDay(
  date: string,
  today: string,
): { kind: 'today' } | { kind: 'daily'; date: string } {
  return date === today ? { kind: 'today' } : { kind: 'daily', date }
}

function DayChevron({
  label,
  binding,
  onClick,
  children,
}: {
  label: string
  binding: string | null
  onClick: () => void
  children: ReactElement
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-secondary"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} {binding !== null && <ShortcutKeys binding={binding} />}
      </TooltipContent>
    </Tooltip>
  )
}
