import { useKeymap } from '@meowdown/react'
import { KEEP_MARKER, KEEP_MARKER_SUFFIX, lastKeepMarker } from '@dayjot/core'

/**
 * The Keep gesture: `⌘⇧B` marks the line at the caret as a keepsake, or
 * unmarks one already kept.
 *
 * Keeping writes the reserved `#keep` tag into the line itself — the marker is
 * ordinary Markdown, so the file stays the source of truth and the Keepsakes
 * view is a projection of what the text already says. Unkeeping removes only
 * that token: **the sentence is never deleted**, it just stops being kept.
 *
 * The edit is a plain text splice on the textblock at the caret, dispatched as
 * one undoable step, so ⌘Z takes the mark back off in a single press.
 *
 * `⌘⇧K` — the gesture's natural key — belongs to meowdown's "Insert a
 * wikilink"; `⌘⇧B` reads as "bookmark" and sits beside it unclaimed.
 */

/** The edit toggling the marker makes, in offsets relative to the line's text. */
export type KeepMarkEdit =
  | { kind: 'insert'; text: string; at: number; through: number }
  | { kind: 'delete'; from: number; to: number }

/**
 * How to toggle the marker on `line`, or null when the line can carry none.
 *
 * Marking appends the marker after the last non-whitespace character, replacing
 * any trailing whitespace so it never lands past the end of the sentence.
 * Unmarking removes the final marker and the space that separates it, restoring
 * the line exactly as it read before. A blank line is left alone: a bare
 * `#keep` is a marker with nothing kept.
 */
export function keepMarkEdit(line: string): KeepMarkEdit | null {
  const marker = lastKeepMarker(line)
  if (marker === null) {
    if (line.trim() === '') {
      return null
    }
    const trimmed = line.replace(/\s+$/u, '')
    return { kind: 'insert', text: KEEP_MARKER_SUFFIX, at: trimmed.length, through: line.length }
  }
  const separated = marker.from > 0 && /\s/u.test(line[marker.from - 1] ?? '')
  return { kind: 'delete', from: separated ? marker.from - 1 : marker.from, to: marker.to }
}

/** The binding, so the keymap registry and the shortcuts sheet share one definition. */
export const KEEP_MARK_BINDING = 'Mod-Shift-b'

/** What the ⌘/ sheet calls it. */
export const KEEP_MARK_DESCRIPTION = `Keep this line (${KEEP_MARKER})`

export function KeepMark(): null {
  useKeymap({
    [KEEP_MARK_BINDING]: (state, dispatch) => {
      const { $from } = state.selection
      const parent = $from.parent
      // A code block keeps `#keep` literal, so its lines are never keepsakes.
      if (!parent.isTextblock || parent.type.spec.code) {
        return false
      }
      const start = $from.start()
      const end = $from.end()
      // A one-character placeholder per inline leaf keeps every index in this
      // string aligned with `start + index` in the document.
      const line = state.doc.textBetween(start, end, '￼', '￼')
      const edit = keepMarkEdit(line)
      if (edit === null) {
        return false
      }
      const transaction =
        edit.kind === 'insert'
          ? state.tr.insertText(edit.text, start + edit.at, start + edit.through)
          : state.tr.delete(start + edit.from, start + edit.to)
      dispatch?.(transaction.scrollIntoView())
      return true
    },
  })

  return null
}
