import type { ReactElement } from 'react'
import { noteEditorHandleFor } from '@/editor/editor-handle-registry'

interface NoteBottomRunwayProps {
  /** Graph-relative path of the note this canvas is editing. */
  path: string
}

/**
 * The empty tail of a note's canvas: scroll room past the last line, so a note
 * that fills the viewport can still be pushed up until what you're writing
 * sits where you read rather than pinned to the bottom edge. `CaretRunway`
 * does that pushing automatically while you type; this is the space it needs.
 *
 * Rendered last in the scrolling column — after the backlinks panel — so the
 * runway is genuinely the end of the canvas and nothing useful is stranded
 * below it. It costs a short note nothing: the pane's editor is the column's
 * `grow` item, so it gives up exactly this much height and the column still
 * ends at `min-h-full`.
 *
 * Clicking the runway lands the caret at the end of the note, so the whole
 * blank canvas keeps behaving as one click-to-write surface — the affordance
 * the stretched editor provides over the space above it.
 */
export function NoteBottomRunway({ path }: NoteBottomRunwayProps): ReactElement {
  return (
    <div
      className="dayjot-bottom-runway"
      // Default-prevented so the press never moves focus out of the editor
      // (a blur/refocus round trip flickers the caret and the toolbars that
      // track it); the caret placement below is the whole interaction.
      onMouseDown={(event) => {
        event.preventDefault()
        const handle = noteEditorHandleFor(path)
        if (handle === null) {
          return
        }
        handle.focus()
        handle.setSelection('end')
      }}
    />
  )
}
