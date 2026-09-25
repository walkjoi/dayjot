import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc } from '@meowdown/core'
import type { ProseMirrorNode } from '@prosekit/pm/model'
import { EditorState, TextSelection } from '@prosekit/pm/state'
import { keepEndEdit, keepMarkEdit, keepsakeLocation, keepToggleTransaction, type LineEdit } from './keep-edits'

/** Apply a line edit the way the toggle applies it to the document. */
function apply(line: string, edit: LineEdit | null): string | null {
  return edit === null ? null : line.slice(0, edit.from) + edit.text + line.slice(edit.to)
}

function toggle(line: string): string | null {
  return apply(line, keepMarkEdit(line))
}

describe('keepMarkEdit', () => {
  it('puts the marker at the start of an unkept line', () => {
    expect(toggle('那瓶 Sancerre 是 Domaine Vacheron')).toBe('#keep 那瓶 Sancerre 是 Domaine Vacheron')
  })

  it('removes a leading marker and the space after it', () => {
    expect(toggle('#keep  [[SD]] 使用 unique constraint')).toBe('[[SD]] 使用 unique constraint')
  })

  it('removes a trailing marker and the space before it', () => {
    expect(toggle('a fragment worth keeping #keep')).toBe('a fragment worth keeping')
  })

  it('round-trips: keeping then unkeeping restores the line exactly', () => {
    const line = '10:02 妈妈在电话里说：「日子是过给自己看的。」'
    expect(toggle(toggle(line)!)).toBe(line)
  })

  it('leaves a blank line alone — a bare marker keeps nothing', () => {
    expect(keepMarkEdit('')).toBeNull()
    expect(keepMarkEdit('   ')).toBeNull()
  })

  it('removes the last marker when none leads, leaving one written as prose', () => {
    expect(toggle('wrote about #keep today #keep')).toBe('wrote about #keep today')
  })

  it('treats a longer tag as ordinary text, not the marker', () => {
    expect(toggle('a note about #keepsake')).toBe('#keep a note about #keepsake')
  })
})

describe('keepEndEdit', () => {
  it('closes after the last word, replacing trailing whitespace', () => {
    expect(apply('单机的乐观锁   ', keepEndEdit('单机的乐观锁   '))).toBe('单机的乐观锁 #keep-end')
  })

  it('writes the bare closer on an empty line', () => {
    expect(apply('', keepEndEdit(''))).toBe('#keep-end')
  })
})

/** Position of `needle` in `doc` (plus `offset`), searching text nodes. */
function at(doc: ProseMirrorNode, needle: string, offset = 0): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found !== -1) {
      return false
    }
    const index = node.isText ? (node.text ?? '').indexOf(needle) : -1
    if (index !== -1) {
      found = pos + index + offset
    }
    return true
  })
  if (found === -1) {
    throw new Error(`"${needle}" is not in the document`)
  }
  return found
}

/**
 * Press ⌘⇧B on `markdown` with the selection running from the start of `from`
 * to the end of `to` (a caret at `from` when `to` is omitted).
 */
function press(markdown: string, from: string, to?: string): string | null {
  const doc = markdownToDoc(markdown)
  const anchor = at(doc, from)
  const head = to === undefined ? anchor : at(doc, to, to.length)
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) })
  const transaction = keepToggleTransaction(state)
  return transaction === null ? null : docToMarkdown(transaction.doc).trim()
}

describe('keepToggleTransaction', () => {
  it('keeps the line at the caret', () => {
    expect(press('a line\n\nanother', 'a line')).toBe('#keep a line\n\nanother')
  })

  it('unkeeps a kept line', () => {
    expect(press('#keep a line\n\nanother', 'a line')).toBe('a line\n\nanother')
  })

  it('keeps a selection across lines as one section', () => {
    const note = 'before\n\n几个有意思的点：\n\n- 用 geohash 做 cache key\n- 单机的乐观锁\n\nafter'
    expect(press(note, '几个有意思的点', '单机的乐观锁')).toBe(
      'before\n\n#keep 几个有意思的点：\n\n- 用 geohash 做 cache key\n- 单机的乐观锁 #keep-end\n\nafter',
    )
  })

  it('closes a section ending in a code block on a line of its own', () => {
    const note = 'GCD 最大公约数\n\n```python\nx = 1\n```\n\nafter'
    expect(press(note, 'GCD', 'x = 1')).toBe(
      '#keep GCD 最大公约数\n\n```python\nx = 1\n```\n\n#keep-end\n\nafter',
    )
  })

  it('unkeeps a whole section from a caret anywhere inside it, restoring it exactly', () => {
    const note = 'GCD 最大公约数\n\n```python\nx = 1\n```\n\nafter'
    const kept = press(note, 'GCD', 'x = 1')!
    expect(press(kept, 'x = 1')).toBe(note)
  })

  it('absorbs a line kept on its own into a section around it', () => {
    expect(press('one\n\n#keep two\n\nthree', 'one', 'three')).toBe(
      '#keep one\n\ntwo\n\nthree #keep-end',
    )
  })

  it('keeps the opener a section already starts with', () => {
    expect(press('one #keep\n\ntwo', 'one', 'two')).toBe('one #keep\n\ntwo #keep-end')
  })

  it('does not reach into a line the selection only touches the start of', () => {
    const doc = markdownToDoc('one\n\ntwo')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, at(doc, 'one'), at(doc, 'two')),
    })
    expect(docToMarkdown(keepToggleTransaction(state)!.doc).trim()).toBe('#keep one\n\ntwo')
  })

  it('drops a stray closer a new keep would otherwise run down to', () => {
    expect(press('fresh\n\nleft over #keep-end', 'fresh')).toBe('#keep fresh\n\nleft over')
  })

  it('does nothing inside a code block', () => {
    expect(press('```\ncode\n```', 'code')).toBeNull()
  })
})

describe('keepsakeLocation', () => {
  it('finds the block of the n-th opener, counting sections and lines alike', () => {
    const doc = markdownToDoc('#keep one\n\n#keep two\n\nmiddle #keep-end\n\n#keep three')
    const location = keepsakeLocation(doc, 2)
    expect(location).not.toBeNull()
    expect(doc.resolve(location!.caret).parent.textContent).toBe('#keep three')
  })

  it('skips markers inside code, as the parser does', () => {
    const doc = markdownToDoc('```\n#keep not this\n```\n\n#keep this one')
    expect(doc.resolve(keepsakeLocation(doc, 0)!.caret).parent.textContent).toBe('#keep this one')
  })

  it('is null when the note no longer holds that many', () => {
    expect(keepsakeLocation(markdownToDoc('#keep only'), 1)).toBeNull()
  })
})
