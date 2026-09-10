import { describe, expect, it } from 'vitest'
import { findKeepMarkers, isReservedTag, lastKeepMarker, KEEP_MARKER } from './keep-marker'

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

describe('lastKeepMarker', () => {
  it('returns the final marker so an earlier mention in prose survives the toggle', () => {
    const text = 'wrote about #keep today, worth remembering #keep'
    expect(lastKeepMarker(text)?.from).toBe(text.lastIndexOf(KEEP_MARKER))
  })

  it('is null for an unkept line', () => {
    expect(lastKeepMarker('nothing marked here')).toBeNull()
  })
})

describe('isReservedTag', () => {
  it('reserves keep in any casing and nothing else', () => {
    expect(isReservedTag('keep')).toBe(true)
    expect(isReservedTag('KEEP')).toBe(true)
    expect(isReservedTag('keepsake')).toBe(false)
    expect(isReservedTag('wine')).toBe(false)
  })
})
