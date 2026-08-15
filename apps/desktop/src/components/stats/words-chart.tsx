import { useMemo, type ReactElement } from 'react'
import type { DailyWordCount } from '@dayjot/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { fillMissingDays, formatDayShort, rangeStartIso, tooltipDayLabel } from './series'

interface WordsChartProps {
  /** Word counts for the shown window, ascending (missing days are filled here). */
  series: readonly DailyWordCount[]
  /** Today's ISO date — the window's inclusive end. */
  today: string
  /** Window length in days. */
  days: number
}

const chartConfig = {
  words: { label: 'Words', color: 'var(--accent)' },
} satisfies ChartConfig

/**
 * Words written per day over the window. Unwritten days are honest zeros, so
 * the timeline never compresses and a quiet week looks like one.
 */
export function WordsChart({ series, today, days }: WordsChartProps): ReactElement {
  const filled = useMemo(
    () => fillMissingDays(series, rangeStartIso(today, days), today),
    [series, today, days],
  )

  return (
    <section
      aria-label="Words per day"
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-text">Words per day</h2>
        <span className="text-xs text-text-muted">{`last ${days} days`}</span>
      </div>
      <ChartContainer config={chartConfig} className="mt-3 h-40 w-full">
        <BarChart data={filled} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(date: string) => formatDayShort(date)}
          />
          <YAxis
            width={44}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(_label, payload) => tooltipDayLabel(payload)} />}
          />
          <Bar
            dataKey="words"
            fill="var(--color-words)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </section>
  )
}
