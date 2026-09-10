import { describe, expect, it } from 'vitest'
import { keepMarkEdit } from './keep-mark'

/** Apply an edit to a line the way the keymap applies it to the document. */
function toggle(line: string): string | null {
  const edit = keepMarkEdit(line)
  if (edit === null) {
    return null
  }
  return edit.kind === 'insert'
    ? line.slice(0, edit.at) + edit.text + line.slice(edit.through)
    : line.slice(0, edit.from) + line.slice(edit.to)
}

describe('keepMarkEdit', () => {
  it('appends the marker to an unkept line', () => {
    expect(toggle('那瓶 Sancerre 是 Domaine Vacheron')).toBe(
      '那瓶 Sancerre 是 Domaine Vacheron #keep',
    )
  })

  it('removes the marker and its separating space from a kept line', () => {
    expect(toggle('a fragment worth keeping #keep')).toBe('a fragment worth keeping')
  })

  it('round-trips: keeping then unkeeping restores the line exactly', () => {
    const line = '10:02 妈妈在电话里说：「日子是过给自己看的。」'
    expect(toggle(toggle(line)!)).toBe(line)
  })

  it('replaces trailing whitespace instead of marking past the sentence', () => {
    expect(toggle('the light on the floor   ')).toBe('the light on the floor #keep')
  })

  it('leaves a blank line alone — a bare marker keeps nothing', () => {
    expect(keepMarkEdit('')).toBeNull()
    expect(keepMarkEdit('   ')).toBeNull()
  })

  it('unkeeps rather than doubling up when the marker is already there', () => {
    expect(toggle('kept #keep')).toBe('kept')
  })

  it('removes the final marker, leaving an earlier one written as prose', () => {
    expect(toggle('wrote about #keep today #keep')).toBe('wrote about #keep today')
  })

  it('treats a longer tag as ordinary text, not the marker', () => {
    expect(toggle('a note about #keepsake')).toBe('a note about #keepsake #keep')
  })
})
