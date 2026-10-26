import { describe, expect, it } from 'vitest'
import { buildYearRows, daysInMonth, initialPixel, movePixel, pixelYears } from './year-pixels'

describe('buildYearRows', () => {
  it('lays a year out as twelve rows holding only real dates', () => {
    const rows = buildYearRows(2026)
    expect(rows).toHaveLength(12)
    expect(rows.map((row) => row.dates.length)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    expect(rows[0]!.dates[0]).toBe('2026-01-01')
    expect(rows[11]!.dates.at(-1)).toBe('2026-12-31')
  })

  it('gives February its leap day', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(buildYearRows(2028)[1]!.dates.at(-1)).toBe('2028-02-29')
  })
})

describe('pixelYears', () => {
  it("spans the first rated year through today's year, gaps included", () => {
    expect(pixelYears(['2023-05-01', '2025-01-09'], '2026-10-26')).toEqual([2023, 2024, 2025, 2026])
  })

  it("is just today's year with nothing rated", () => {
    expect(pixelYears([], '2026-10-26')).toEqual([2026])
  })

  it('reaches a rated day dated past today', () => {
    expect(pixelYears(['2027-01-02'], '2026-10-26')).toEqual([2026, 2027])
  })
})

describe('movePixel', () => {
  it('steps days left and right, across month rows', () => {
    expect(movePixel('2026-01-31', 'ArrowRight')).toBe('2026-02-01')
    expect(movePixel('2026-03-01', 'ArrowLeft')).toBe('2026-02-28')
  })

  it('keeps the day-of-month moving between rows, clamped to shorter months', () => {
    expect(movePixel('2026-10-26', 'ArrowUp')).toBe('2026-09-26')
    expect(movePixel('2026-03-31', 'ArrowUp')).toBe('2026-02-28')
    expect(movePixel('2026-01-31', 'ArrowDown')).toBe('2026-02-28')
  })

  it("jumps to the row's ends", () => {
    expect(movePixel('2026-02-14', 'Home')).toBe('2026-02-01')
    expect(movePixel('2026-02-14', 'End')).toBe('2026-02-28')
  })

  it('stays inside the shown year', () => {
    expect(movePixel('2026-01-01', 'ArrowLeft')).toBe('2026-01-01')
    expect(movePixel('2026-12-31', 'ArrowRight')).toBe('2026-12-31')
    expect(movePixel('2026-01-15', 'ArrowUp')).toBe('2026-01-15')
    expect(movePixel('2026-12-15', 'ArrowDown')).toBe('2026-12-15')
  })
})

describe('initialPixel', () => {
  it("starts on today in today's year and on January 1st otherwise", () => {
    expect(initialPixel(2026, '2026-10-26')).toBe('2026-10-26')
    expect(initialPixel(2025, '2026-10-26')).toBe('2025-01-01')
  })
})
