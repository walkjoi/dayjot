import { describe, expect, it } from 'vitest'
import { DEEP_LINK_TEXT_MAX_LENGTH } from '@/lib/deep-links/deep-link'
import { isDeepLinkUrl, parseDeepLink } from '@/lib/deep-links/parse'

describe('parseDeepLink', () => {
  it('parses the bare navigation verbs', () => {
    expect(parseDeepLink('dayjot://today')).toEqual({
      kind: 'navigate',
      route: { kind: 'today' },
    })
    expect(parseDeepLink('dayjot://tasks')).toEqual({
      kind: 'navigate',
      route: { kind: 'tasks' },
    })
  })

  it('tolerates a trailing slash and the host lower-casing of the parser', () => {
    expect(parseDeepLink('dayjot://today/')).toEqual({
      kind: 'navigate',
      route: { kind: 'today' },
    })
    expect(parseDeepLink('dayjot://Today')).toEqual({
      kind: 'navigate',
      route: { kind: 'today' },
    })
  })

  it('rejects stray path segments on bare verbs', () => {
    expect(parseDeepLink('dayjot://today/extra')).toBeNull()
    expect(parseDeepLink('dayjot://tasks/2026')).toBeNull()
  })

  it('parses calendar-valid daily dates and rejects impossible ones', () => {
    expect(parseDeepLink('dayjot://daily/2026-07-01')).toEqual({
      kind: 'navigate',
      route: { kind: 'daily', date: '2026-07-01' },
    })
    expect(parseDeepLink('dayjot://daily/2026-02-31')).toBeNull()
    expect(parseDeepLink('dayjot://daily/not-a-date')).toBeNull()
    expect(parseDeepLink('dayjot://daily')).toBeNull()
  })

  it('parses search queries, including an empty one', () => {
    expect(parseDeepLink('dayjot://search?q=meeting%20notes')).toEqual({
      kind: 'navigate',
      route: { kind: 'search', query: 'meeting notes' },
    })
    expect(parseDeepLink('dayjot://search?q=')).toEqual({
      kind: 'navigate',
      route: { kind: 'search', query: '' },
    })
    expect(parseDeepLink('dayjot://search')).toBeNull()
  })

  it('parses note targets in encoded, raw-slash, and id forms', () => {
    expect(parseDeepLink('dayjot://note/Project%20X')).toEqual({
      kind: 'openNote',
      target: 'Project X',
    })
    expect(parseDeepLink('dayjot://note/notes/foo.md')).toEqual({
      kind: 'openNote',
      target: 'notes/foo.md',
    })
    expect(parseDeepLink('dayjot://note/notes%2Ffoo.md')).toEqual({
      kind: 'openNote',
      target: 'notes/foo.md',
    })
    expect(parseDeepLink('dayjot://note/x7Kp2q')).toEqual({
      kind: 'openNote',
      target: 'x7Kp2q',
    })
  })

  it('rejects an empty note target and malformed percent-encoding', () => {
    expect(parseDeepLink('dayjot://note')).toBeNull()
    expect(parseDeepLink('dayjot://note/')).toBeNull()
    expect(parseDeepLink('dayjot://note/%E0%A4%A')).toBeNull()
  })

  it('parses write links into capture payloads', () => {
    expect(parseDeepLink('dayjot://append?text=hello%20world')).toEqual({
      kind: 'capture',
      capture: 'append',
      text: 'hello world',
    })
    expect(parseDeepLink('dayjot://task?text=Buy+milk')).toEqual({
      kind: 'capture',
      capture: 'task',
      text: 'Buy milk',
    })
  })

  it('folds capture text to a single trimmed line', () => {
    expect(parseDeepLink('dayjot://append?text=%20line%20one%0A%0A%23%20line%20two%20')).toEqual({
      kind: 'capture',
      capture: 'append',
      text: 'line one # line two',
    })
  })

  it('rejects empty, whitespace-only, and over-long capture text', () => {
    expect(parseDeepLink('dayjot://append')).toBeNull()
    expect(parseDeepLink('dayjot://append?text=')).toBeNull()
    expect(parseDeepLink('dayjot://append?text=%20%0A%20')).toBeNull()
    const oversized = 'a'.repeat(DEEP_LINK_TEXT_MAX_LENGTH + 1)
    expect(parseDeepLink(`dayjot://append?text=${oversized}`)).toBeNull()
  })

  it('rejects write links carrying a path segment', () => {
    expect(parseDeepLink('dayjot://append/extra?text=hi')).toBeNull()
  })

  it('rejects other schemes, unknown verbs, and non-URLs', () => {
    expect(parseDeepLink('https://today')).toBeNull()
    expect(parseDeepLink('dayjot://settings')).toBeNull()
    expect(parseDeepLink('dayjot://edit-notes?content=evil')).toBeNull()
    expect(parseDeepLink('not a url')).toBeNull()
    expect(parseDeepLink('')).toBeNull()
  })
})

describe('isDeepLinkUrl', () => {
  it('matches the dayjot scheme regardless of case', () => {
    expect(isDeepLinkUrl('dayjot://today')).toBe(true)
    expect(isDeepLinkUrl('DAYJOT://note/abc')).toBe(true)
  })

  it('matches scheme-only, even links the parser would reject', () => {
    expect(isDeepLinkUrl('dayjot://settings')).toBe(true)
    expect(isDeepLinkUrl('dayjot:today')).toBe(true)
  })

  it('rejects other schemes and non-URLs', () => {
    expect(isDeepLinkUrl('https://example.com')).toBe(false)
    expect(isDeepLinkUrl('mailto:someone@example.com')).toBe(false)
    expect(isDeepLinkUrl('assets/cat.png')).toBe(false)
    expect(isDeepLinkUrl('not a url')).toBe(false)
    expect(isDeepLinkUrl('')).toBe(false)
  })
})
