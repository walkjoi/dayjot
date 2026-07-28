import { Priority } from '@meowdown/core'
import { useKeymap } from '@meowdown/react'

/**
 * Backspace inside a code block, handled as ProseMirror transactions instead
 * of native contenteditable deletion.
 *
 * Without this, ProseMirror leaves plain character deletion to the browser
 * and re-reads the DOM mutation afterwards. When the deletion empties a code
 * block that sits inside a list item, Chromium's and WebKit's mutation shape
 * makes prosemirror-view's `readDOMChange` misclassify the edit as an Enter
 * press; prosemirror-flat-list then *splits* the list item, resurrecting the
 * deleted character in a fresh code block and bouncing the caret out of it —
 * an unrecoverable delete/resurrect loop for CJK text typed through an IME
 * (发现于按住退格清空代码块的场景). Dispatching the deletion ourselves means
 * no native mutation, so there is nothing to misread.
 *
 * The empty-block case additionally converts the block back to a paragraph
 * (one visible "the code block is gone" step), registered above the list
 * keymap whose `joinListUp` would otherwise consume the press for an
 * invisible lift out of the list item.
 *
 * The whole component is an app-side shim over upstream behavior; drop it
 * once meowdown handles code-block backspace itself.
 */

/** The length in UTF-16 code units of the last grapheme cluster of `text`. */
export function lastGraphemeLength(text: string): number {
  if (text === '') {
    return 0
  }
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)
    let last = ''
    for (const part of segments) {
      last = part.segment
    }
    return last.length
  }
  // Fallback: treat a trailing surrogate pair as one unit.
  const tail = text.codePointAt(text.length - 2)
  return tail != null && tail > 0xffff ? 2 : 1
}

export function CodeBlockBackspace(): null {
  useKeymap(
    {
      Backspace: (state, dispatch, view) => {
        // A dispatch mid-composition would break the IME's marked text.
        if (view?.composing) {
          return false
        }
        const selection = state.selection
        if (!selection.empty) {
          return false
        }
        const $from = selection.$from
        const parent = $from.parent
        if (!parent.isTextblock || !parent.type.spec.code) {
          return false
        }
        if (parent.content.size === 0) {
          const paragraph = state.schema.nodes['paragraph']
          if (!paragraph) {
            return false
          }
          dispatch?.(state.tr.setBlockType($from.pos, $from.pos, paragraph).scrollIntoView())
          return true
        }
        if ($from.parentOffset === 0) {
          // Block start with content: leave the join/lift chain to decide.
          return false
        }
        const before = parent.textBetween(0, $from.parentOffset)
        const length = lastGraphemeLength(before)
        dispatch?.(state.tr.delete($from.pos - length, $from.pos).scrollIntoView())
        return true
      },
    },
    // Above the list keymap: its `joinListUp` would otherwise take the
    // empty-block press for the invisible lift.
    { priority: Priority.high },
  )

  return null
}
