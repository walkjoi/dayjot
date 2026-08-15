import { describe, expect, it } from 'vitest'
import { computeStreaks } from './streaks'

const TODAY = '2026-08-14'

describe('computeStreaks', () => {
  it('is all zeros with no daily notes', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0 })
  })

  it('counts a run ending today', () => {
    expect(computeStreaks(['2026-08-12', '2026-08-13', '2026-08-14'], TODAY)).toEqual({
      current: 3,
      longest: 3,
    })
  })

  it("does not break the streak when today's note is not written yet", () => {
    expect(computeStreaks(['2026-08-12', '2026-08-13'], TODAY)).toEqual({
      current: 2,
      longest: 2,
    })
  })

  it('resets the current streak after a missed day', () => {
    expect(computeStreaks(['2026-08-10', '2026-08-11', '2026-08-12'], TODAY)).toEqual({
      current: 0, // the last run ends two days ago — yesterday was missed
      longest: 3,
    })
  })

  it('counts a run that ended yesterday as the current streak', () => {
    expect(computeStreaks(['2026-08-11', '2026-08-13'], TODAY)).toEqual({
      current: 1,
      longest: 1,
    })
  })

  it('keeps the longest run even when the current one is shorter', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-14']
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 1, longest: 4 })
  })

  it('tolerates unsorted input and duplicates', () => {
    const dates = ['2026-08-14', '2026-08-12', '2026-08-13', '2026-08-13']
    expect(computeStreaks(dates, TODAY)).toEqual({ current: 3, longest: 3 })
  })

  it('spans a DST transition as plain calendar days', () => {
    // US DST ended 2026-11-01; adjacency must not depend on wall-clock hours.
    expect(computeStreaks(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02')).toEqual({
      current: 3,
      longest: 3,
    })
  })
})
