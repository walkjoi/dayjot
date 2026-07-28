import { describe, expect, it } from 'vitest'

import { lastGraphemeLength } from './code-block-backspace'

describe('lastGraphemeLength', () => {
  it('returns 0 for the empty string', () => {
    expect(lastGraphemeLength('')).toBe(0)
  })

  it('counts a trailing ASCII character as one unit', () => {
    expect(lastGraphemeLength('hello')).toBe(1)
  })

  it('counts a trailing CJK character as one unit', () => {
    expect(lastGraphemeLength('代码')).toBe(1)
  })

  it('counts a trailing newline as one unit', () => {
    expect(lastGraphemeLength('line\n')).toBe(1)
  })

  it('counts a surrogate-pair emoji as one grapheme', () => {
    expect(lastGraphemeLength('a😀')).toBe(2)
  })

  it('counts a ZWJ emoji sequence as one grapheme', () => {
    const family = '👨‍👩‍👧'
    expect(lastGraphemeLength(`x${family}`)).toBe(family.length)
  })

  it('counts a combining-mark cluster as one grapheme', () => {
    expect(lastGraphemeLength('ae\u0301')).toBe(2)
  })
})
