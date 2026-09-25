import { useKeymap } from '@meowdown/react'
import { KEEP_MARKER } from '@dayjot/core'
import { keepToggleTransaction } from './keep-edits'

/**
 * The Keep gesture: `⌘⇧B` keeps the line at the caret, keeps a selection across
 * lines as one section, or — pressed on something already kept — unkeeps it.
 * The edits themselves live in {@link keepToggleTransaction}; each press is one
 * undoable step, so ⌘Z takes it back in a single press.
 *
 * `⌘⇧K` — the gesture's natural key — belongs to meowdown's "Insert a
 * wikilink"; `⌘⇧B` reads as "bookmark" and sits beside it unclaimed.
 */

/** The binding, so the keymap registry and the shortcuts sheet share one definition. */
export const KEEP_MARK_BINDING = 'Mod-Shift-b'

/** What the ⌘/ sheet calls it. */
export const KEEP_MARK_DESCRIPTION = `Keep this line or selection (${KEEP_MARKER})`

export function KeepMark(): null {
  useKeymap({
    [KEEP_MARK_BINDING]: (state, dispatch) => {
      const transaction = keepToggleTransaction(state)
      if (transaction === null) {
        return false
      }
      dispatch?.(transaction)
      return true
    },
  })

  return null
}
