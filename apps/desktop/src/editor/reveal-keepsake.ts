import { TextSelection } from '@prosekit/pm/state'
import type { EditorView } from '@prosekit/pm/view'
import { keepsakeLocation } from './keep-edits'

/**
 * Land on a keepsake: the caret at the start of the note's `markerIndex`-th
 * kept line, focused, with that line scrolled to the middle of the view so it
 * reads in its day's context rather than pinned to an edge. False when the
 * note no longer holds that keepsake (edited since the view last read it).
 *
 * The scroll waits a frame so it lands after the arrival's own scroll reset.
 */
export function revealKeepsake(view: EditorView, markerIndex: number): boolean {
  const location = keepsakeLocation(view.state.doc, markerIndex)
  if (location === null) {
    return false
  }
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, location.caret)),
  )
  view.focus()
  const line = view.nodeDOM(location.blockPos)
  if (line instanceof HTMLElement) {
    requestAnimationFrame(() => line.scrollIntoView({ block: 'center' }))
  }
  return true
}
