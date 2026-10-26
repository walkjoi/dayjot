import { describe, expect, it } from 'vitest'
import { summarizeCycles } from './cycles'

function run(start: string, count: number): string[] {
  const first = Date.parse(`${start}T00:00:00Z`)
  return Array.from({ length: count }, (_unused, index) =>
    new Date(first + index * 86_400_000).toISOString().slice(0, 10),
  )
}

describe('summarizeCycles', () => {
  it('has nothing to say without marks', () => {
    expect(summarizeCycles([], '2026-10-26')).toEqual({
      periods: [],
      cycleDay: null,
      averageCycleDays: null,
      cyclesAveraged: 0,
    })
  })

  it('groups consecutive marked days into periods and counts the cycle day', () => {
    const marks = [...run('2026-08-31', 5), ...run('2026-09-28', 4), ...run('2026-10-26', 1)]
    const summary = summarizeCycles(marks, '2026-10-30')

    expect(summary.periods).toEqual([
      { start: '2026-08-31', end: '2026-09-04', days: 5 },
      { start: '2026-09-28', end: '2026-10-01', days: 4 },
      { start: '2026-10-26', end: '2026-10-26', days: 1 },
    ])
    expect(summary.cycleDay).toBe(5)
    expect(summary.averageCycleDays).toBe(28) // 28 and 28
    expect(summary.cyclesAveraged).toBe(2)
  })

  it('bridges a single unlogged day inside a period', () => {
    const summary = summarizeCycles(['2026-10-01', '2026-10-02', '2026-10-04'], '2026-10-04')
    expect(summary.periods).toEqual([{ start: '2026-10-01', end: '2026-10-04', days: 4 }])
  })

  it('starts a new period after a longer gap', () => {
    const summary = summarizeCycles(['2026-10-01', '2026-10-04'], '2026-10-04')
    expect(summary.periods.map((period) => period.start)).toEqual(['2026-10-01', '2026-10-04'])
  })

  it('keeps implausible gaps out of the average', () => {
    // Jan → Mar (73 days) hides a period never marked; Mar → Apr is a real cycle.
    const marks = ['2026-01-01', '2026-03-15', '2026-04-12']
    const summary = summarizeCycles(marks, '2026-04-20')
    expect(summary.averageCycleDays).toBe(28)
    expect(summary.cyclesAveraged).toBe(1)
  })

  it('averages only the six most recent cycles', () => {
    const starts = ['2025-01-01', '2025-02-15', '2025-03-15', '2025-04-12', '2025-05-10']
    const more = ['2025-06-07', '2025-07-05', '2025-08-02']
    const summary = summarizeCycles([...starts, ...more], '2025-08-10')
    // 45 (Jan → Feb) falls out; the last six are all 28.
    expect(summary.averageCycleDays).toBe(28)
    expect(summary.cyclesAveraged).toBe(6)
  })

  it('stops counting the cycle day once the latest start is long past', () => {
    expect(summarizeCycles(['2026-06-01'], '2026-07-30').cycleDay).toBe(60)
    expect(summarizeCycles(['2026-06-01'], '2026-07-31').cycleDay).toBeNull()
  })

  it('ignores marks dated after today', () => {
    const summary = summarizeCycles(['2026-10-01', '2026-11-03'], '2026-10-26')
    expect(summary.periods).toHaveLength(1)
    expect(summary.cycleDay).toBe(26)
  })
})
