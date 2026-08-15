import { describe, expect, it } from 'vitest'
import {
  buildWeightPoints,
  fillMissingDays,
  formatDayShort,
  isoFromDayNumber,
  rangeStartIso,
  tooltipDayLabel,
} from './series'

describe('buildWeightPoints', () => {
  it('averages over the trailing 7 calendar days, not the last 7 points', () => {
    const points = buildWeightPoints([
      { date: '2026-08-01', kg: 70, notePath: 'daily/2026-08-01.md' },
      { date: '2026-08-02', kg: 72, notePath: 'daily/2026-08-02.md' },
      // A gap: 08-10 is more than 7 days past both earlier entries.
      { date: '2026-08-10', kg: 74, notePath: 'daily/2026-08-10.md' },
    ])
    expect(points.map((point) => point.average)).toEqual([70, 71, 74])
  })

  it('keeps true gap widths via the numeric day axis', () => {
    const points = buildWeightPoints([
      { date: '2026-08-01', kg: 70, notePath: 'daily/2026-08-01.md' },
      { date: '2026-08-11', kg: 71, notePath: 'daily/2026-08-11.md' },
    ])
    expect(points[1]!.day - points[0]!.day).toBe(10)
  })
})

describe('fillMissingDays', () => {
  it('fills unwritten days with zero words', () => {
    const filled = fillMissingDays(
      [{ date: '2026-08-12', words: 100 }],
      '2026-08-11',
      '2026-08-13',
    )
    expect(filled).toEqual([
      { date: '2026-08-11', words: 0 },
      { date: '2026-08-12', words: 100 },
      { date: '2026-08-13', words: 0 },
    ])
  })
})

describe('range and labels', () => {
  it('computes an inclusive N-day range start', () => {
    expect(rangeStartIso('2026-08-14', 30)).toBe('2026-07-16')
  })

  it('formats a short day label from UTC parts', () => {
    expect(formatDayShort('2026-08-14')).toBe('Aug 14')
  })

  it('never throws on non-date input — a throwing chart formatter unmounts the app', () => {
    expect(formatDayShort('')).toBe('')
    expect(formatDayShort('Weight')).toBe('')
    expect(isoFromDayNumber(Number.NaN)).toBe('')
    expect(isoFromDayNumber(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('tooltipDayLabel', () => {
  it('reads the hovered point’s own date', () => {
    const payload = [{ payload: { date: '2026-08-14', kg: 72.5, day: 20_679 } }]
    expect(tooltipDayLabel(payload)).toBe('Aug 14')
  })

  it('returns empty for the shapes recharts can hand a label formatter', () => {
    // The white-screen regression: shadcn's ChartTooltipContent passes the
    // series' *config label* ('Weight') as the label on numeric axes, so the
    // date must come from the payload — and any malformed payload must
    // degrade to an empty label, never a throw.
    expect(tooltipDayLabel(undefined)).toBe('')
    expect(tooltipDayLabel([])).toBe('')
    expect(tooltipDayLabel([{ payload: undefined }])).toBe('')
    expect(tooltipDayLabel([{ payload: { kg: 72.5 } }])).toBe('')
    expect(tooltipDayLabel([{ payload: { date: 42 } }])).toBe('')
  })
})
