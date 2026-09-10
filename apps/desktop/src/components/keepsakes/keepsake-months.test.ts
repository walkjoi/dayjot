import { describe, expect, it } from 'vitest'
import type { Keepsake } from '@dayjot/core'
import { groupKeepsakesByMonth, keepsakeDayLabel } from './keepsake-months'

function keepsake(text: string, dailyDate: string | null, updatedAt = 0): Keepsake {
  return {
    notePath: dailyDate === null ? `notes/${text}.md` : `daily/${dailyDate}.md`,
    noteTitle: text,
    dailyDate,
    updatedAt,
    markerOffset: 0,
    text,
    links: [],
  }
}

describe('groupKeepsakesByMonth', () => {
  it('groups consecutive keepsakes of one month under a single rule', () => {
    const months = groupKeepsakesByMonth([
      keepsake('a', '2026-09-09'),
      keepsake('b', '2026-09-02'),
      keepsake('c', '2026-08-27'),
    ])

    expect(months.map((month) => month.key)).toEqual(['2026-09', '2026-08'])
    expect(months[0]?.keepsakes.map((entry) => entry.text)).toEqual(['a', 'b'])
    expect(months[1]?.keepsakes.map((entry) => entry.text)).toEqual(['c'])
  })

  it('preserves the order it is given rather than re-sorting', () => {
    const months = groupKeepsakesByMonth([keepsake('a', '2026-09-02'), keepsake('b', '2026-09-09')])

    expect(months[0]?.keepsakes.map((entry) => entry.text)).toEqual(['a', 'b'])
  })

  it('groups a non-daily keepsake by the day its note was last touched', () => {
    const months = groupKeepsakesByMonth([keepsake('wine', null, new Date(2026, 5, 18, 12).getTime())])

    expect(months[0]?.key).toBe('2026-06')
  })

  it('has no months for an empty box', () => {
    expect(groupKeepsakesByMonth([])).toEqual([])
  })
})

describe('keepsakeDayLabel', () => {
  it('reads the fragment date as a local day, never slipping across a timezone', () => {
    expect(keepsakeDayLabel(keepsake('a', '2026-09-01'))).toContain('2026')
    expect(keepsakeDayLabel(keepsake('a', '2026-09-01'))).toContain('1')
  })
})
