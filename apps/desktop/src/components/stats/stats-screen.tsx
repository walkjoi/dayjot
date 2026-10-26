import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { computeStreaks } from '@dayjot/core'
import { ScrollRestored } from '@/routing/scroll-restore'
import { useToday } from '@/lib/use-today'
import {
  useDailyMoods,
  useDailyNoteDates,
  useDailyWeights,
  useDailyWordCounts,
  useNoteCount,
  usePeriodDays,
} from '@/hooks/use-stats'
import { CycleTiles } from './cycle-tiles'
import { StatTile } from './stat-tile'
import { WeightChart } from './weight-chart'
import { WordsChart } from './words-chart'
import { YearInPixels } from './year-in-pixels'
import { rangeStartIso } from './series'

const WORDS_WINDOW_DAYS = 90

/**
 * The Stats page: journaling streaks, today's words, the note count, words
 * per day, and — only for graphs that log any — the cycle, the Year in Pixels
 * of mood ratings and period days, and the weight trend. Everything is read
 * from the index, so the page refreshes as notes are edited. The logged
 * sections render no trace of themselves without data: moods and period days
 * come from the daily note's mood bar (or `/mood`, `/period`), weight from a
 * `weight::` line (or `/weight`).
 */
export function StatsScreen(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const today = useToday()
  const dailyDates = useDailyNoteDates()
  const noteCount = useNoteCount()
  const weights = useDailyWeights()
  const moods = useDailyMoods()
  const periodDays = usePeriodDays()
  const wordCounts = useDailyWordCounts(rangeStartIso(today, WORDS_WINDOW_DAYS))

  const streaks = useMemo(() => computeStreaks(dailyDates, today), [dailyDates, today])
  const wordsToday = wordCounts.find((entry) => entry.date === today)?.words ?? 0

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      aria-label="Stats"
      className="flex h-full min-h-0 flex-col outline-none"
    >
      <header className="flex flex-none items-center border-b border-border py-2.5 pl-4 pr-3 lg:pl-10">
        <div className="window-drag-control min-w-0 flex-1">
          <h1 className="py-1.5 text-sm font-medium text-text">Stats</h1>
        </div>
      </header>

      <ScrollRestored className="min-h-0 flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Current streak" value={String(streaks.current)} detail="days" />
            <StatTile label="Longest streak" value={String(streaks.longest)} detail="days" />
            <StatTile
              label="Words today"
              value={wordsToday.toLocaleString('en-US')}
              detail="in today’s note"
            />
            <StatTile label="Notes" value={noteCount.toLocaleString('en-US')} detail="in this graph" />
          </div>

          {periodDays.length > 0 && <CycleTiles periodDays={periodDays} today={today} />}
          {(moods.length > 0 || periodDays.length > 0) && (
            <YearInPixels moods={moods} periodDays={periodDays} today={today} />
          )}
          {weights.length > 0 && (
            <WeightChart series={weights} today={today} periodDays={periodDays} />
          )}
          {wordCounts.length > 0 && (
            <WordsChart series={wordCounts} today={today} days={WORDS_WINDOW_DAYS} />
          )}
        </div>
      </ScrollRestored>
    </div>
  )
}
