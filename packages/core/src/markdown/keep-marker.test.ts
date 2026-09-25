import { describe, expect, it } from 'vitest'
import {
  findKeepMarkers,
  findKeepMarkerTokens,
  isReservedTag,
  KEEP_MARKER,
  pairKeepMarkers,
  type KeepMarkerKind,
} from './keep-marker'

describe('findKeepMarkers', () => {
  it('finds the marker at a line end and at the start of the text', () => {
    expect(findKeepMarkers('a fragment worth keeping #keep')).toEqual([
      { from: 'a fragment worth keeping '.length, to: 'a fragment worth keeping #keep'.length },
    ])
    expect(findKeepMarkers('#keep on its own')).toEqual([{ from: 0, to: KEEP_MARKER.length }])
  })

  it('matches case-insensitively, like every other tag', () => {
    expect(findKeepMarkers('something #Keep')).toHaveLength(1)
  })

  it('does not match a longer tag that merely starts with keep', () => {
    expect(findKeepMarkers('#keeping #keepsake #keep/sake')).toEqual([])
  })

  it('requires the tag boundary before the hash', () => {
    expect(findKeepMarkers('email me at me#keep')).toEqual([])
  })

  it('finds every occurrence, in document order', () => {
    const spans = findKeepMarkers('#keep one #keep two')
    expect(spans.map((span) => span.from)).toEqual([0, '#keep one '.length])
  })
})

describe('findKeepMarkerTokens', () => {
  it('reads openers and closers in document order', () => {
    const text = '#keep a section — the end #keep-end, then #keep again'
    expect(findKeepMarkerTokens(text)).toEqual([
      { kind: 'open', from: 0, to: 5 },
      { kind: 'close', from: text.indexOf('#keep-end'), to: text.indexOf('#keep-end') + 9 },
      { kind: 'open', from: text.lastIndexOf('#keep'), to: text.lastIndexOf('#keep') + 5 },
    ])
  })

  it('never reads the closer as an opener, nor longer tags as either', () => {
    expect(findKeepMarkers('done #keep-end')).toEqual([])
    expect(findKeepMarkerTokens('#keep-ending #keep-end/x #keeper')).toEqual([])
  })

  it('matches the closer case-insensitively', () => {
    expect(findKeepMarkerTokens('done #Keep-End')).toEqual([{ kind: 'close', from: 5, to: 14 }])
  })
})

describe('pairKeepMarkers', () => {
  /** Pair a sequence of kinds, reporting each pair as `index:open[-close]` token positions. */
  function pairs(kinds: KeepMarkerKind[]): string[] {
    const tokens = kinds.map((kind, position) => ({ kind, position }))
    return pairKeepMarkers(tokens).map(
      (pair) =>
        `${pair.index}:${pair.open.position}${pair.close === null ? '' : `-${pair.close.position}`}`,
    )
  }

  it('makes a lone opener a single line', () => {
    expect(pairs(['open'])).toEqual(['0:0'])
  })

  it('closes a section with the next closer', () => {
    expect(pairs(['open', 'close'])).toEqual(['0:0-1'])
  })

  it('makes an opener followed by another opener a single line', () => {
    expect(pairs(['open', 'open', 'close'])).toEqual(['0:0', '1:1-2'])
  })

  it('ignores a closer with nothing open', () => {
    expect(pairs(['close', 'open', 'close', 'close'])).toEqual(['0:1-2'])
  })

  it('counts every opener for the index, sections and lines alike', () => {
    expect(pairs(['open', 'open', 'close', 'open'])).toEqual(['0:0', '1:1-2', '2:3'])
  })
})

describe('isReservedTag', () => {
  it('reserves keep and keep-end in any casing and nothing else', () => {
    expect(isReservedTag('keep')).toBe(true)
    expect(isReservedTag('KEEP')).toBe(true)
    expect(isReservedTag('keep-end')).toBe(true)
    expect(isReservedTag('keepsake')).toBe(false)
    expect(isReservedTag('wine')).toBe(false)
  })
})
