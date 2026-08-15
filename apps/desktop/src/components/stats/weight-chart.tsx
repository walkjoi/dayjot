import { useMemo, useState, type ReactElement } from 'react'
import type { DailyWeight } from '@dayjot/core'
import { CartesianGrid, ComposedChart, Line, Scatter, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'
import {
  buildWeightPoints,
  dayNumberFromIso,
  formatDayShort,
  isoFromDayNumber,
  rangeStartIso,
  tooltipDayLabel,
} from './series'

interface WeightChartProps {
  /** The full per-day series, ascending (the section is not rendered when empty). */
  series: readonly DailyWeight[]
  /** Today's ISO date — anchors the range switcher and the 30-day delta. */
  today: string
}

const RANGES = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: null },
] as const

type RangeKey = (typeof RANGES)[number]['key']

// Both series are the same entity (weight), so they share the accent — the
// raw points are the faded evidence, the trailing mean is the trend.
const chartConfig = {
  kg: { label: 'Weight', color: 'var(--accent)' },
  average: { label: '7-day avg', color: 'var(--accent)' },
} satisfies ChartConfig

/** `72.5 kg`, always one decimal — the unit the grammar accepts is the unit shown. */
function formatKg(value: number): string {
  return `${value.toFixed(1)} kg`
}

/**
 * The weight trend: faded raw daily points over a 7-day moving-average line,
 * on a true time axis (gaps keep their width). Clicking a point opens that
 * day's note — the entry is a line of markdown, so that's where edits happen.
 */
export function WeightChart({ series, today }: WeightChartProps): ReactElement {
  const { navigate } = useRouter()
  const [range, setRange] = useState<RangeKey>('90d')

  const points = useMemo(() => buildWeightPoints([...series]), [series])
  const visible = useMemo(() => {
    const days = RANGES.find((option) => option.key === range)?.days ?? null
    if (days === null) {
      return points
    }
    const firstDay = dayNumberFromIso(rangeStartIso(today, days))
    return points.filter((point) => point.day >= firstDay)
  }, [points, range, today])

  const latest = points.at(-1)
  const delta = useMemo(() => {
    if (points.length < 2 || latest === undefined) {
      return null
    }
    const anchorDay = dayNumberFromIso(today) - 30
    const baseline = [...points].reverse().find((point) => point.day <= anchorDay) ?? points[0]!
    return latest.kg - baseline.kg
  }, [points, latest, today])

  return (
    <section
      aria-label="Weight"
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium text-text">Weight</h2>
          {latest !== undefined && (
            <span className="text-sm tabular-nums text-text-secondary">{formatKg(latest.kg)}</span>
          )}
          {delta !== null && (
            <span className="text-xs tabular-nums text-text-muted">
              {`${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg vs 30d ago`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5" role="group" aria-label="Time range">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={range === option.key}
              onClick={() => setRange(option.key)}
              className={cn(
                'rounded-md px-1.5 py-0.5 text-xs',
                range === option.key
                  ? 'bg-accent-soft text-accent-soft-text'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          No entries in this range — try a longer one.
        </p>
      ) : (
        <ChartContainer config={chartConfig} className="mt-3 h-56 w-full">
          <ComposedChart data={visible} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="day"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(day: number) => formatDayShort(isoFromDayNumber(day))}
            />
            <YAxis
              domain={['dataMin - 0.5', 'dataMax + 0.5']}
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => tooltipDayLabel(payload)}
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                      </span>
                      <span className="font-mono tabular-nums">{formatKg(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Scatter
              dataKey="kg"
              fill="var(--color-kg)"
              fillOpacity={0.4}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(point: { payload?: { notePath?: string } }) => {
                const notePath = point.payload?.notePath
                if (notePath !== undefined) {
                  navigate(routeForPath(notePath))
                }
              }}
            />
            <Line
              dataKey="average"
              type="monotone"
              stroke="var(--color-average)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      )}
    </section>
  )
}
