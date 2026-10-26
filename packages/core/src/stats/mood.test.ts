import { describe, expect, it } from 'vitest'
import { isMoodRating, MOOD_SCALE, moodLabel } from './mood'

describe('mood scale', () => {
  it('runs Awful through Great with no zero', () => {
    expect(MOOD_SCALE.map((point) => point.label)).toEqual(['Awful', 'Bad', 'Okay', 'Good', 'Great'])
    expect(MOOD_SCALE.map((point) => point.rating)).toEqual([1, 2, 3, 4, 5])
  })

  it('labels ratings on the scale and nothing else', () => {
    expect(moodLabel(4)).toBe('Good')
    expect(moodLabel(0)).toBeNull()
    expect(moodLabel(2.5)).toBeNull()
    expect(isMoodRating(5)).toBe(true)
    expect(isMoodRating(6)).toBe(false)
  })
})
