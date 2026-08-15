import { describe, expect, it } from 'vitest'
import { countWords } from './word-count'

describe('countWords', () => {
  it('counts nothing in an empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('counts Latin words by whitespace', () => {
    expect(countWords('hello brave new world')).toBe(4)
  })

  it('counts each CJK character as one word', () => {
    expect(countWords('今天天气很好')).toBe(6)
    expect(countWords('ひらがな')).toBe(4)
    expect(countWords('한국어')).toBe(3)
  })

  it('counts mixed Chinese and English the way word processors do', () => {
    expect(countWords('今天的 meeting 很棒')).toBe(6) // 3 chars + 1 word + 2 chars
  })

  it('does not count bare punctuation as words', () => {
    expect(countWords('hello — world … !')).toBe(2)
    expect(countWords('。、!')).toBe(0)
  })

  it('counts numbers as words', () => {
    expect(countWords('3 apples and 42')).toBe(4)
  })
})
