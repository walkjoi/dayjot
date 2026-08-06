import { useEffect } from 'react'
import { useEditor } from '@meowdown/react'
import { findScrollContainer } from '@/lib/scroll-container'

/**
 * How much of the visible note viewport stays clear below the caret while
 * typing, as a fraction of that viewport. Kept at or under the
 * `.dayjot-bottom-runway` reserve so the floor is still reachable while
 * typing the last line of a note.
 */
const CARET_FLOOR_FRACTION = 0.28
const CARET_FLOOR_MIN_PX = 96
const CARET_FLOOR_MAX_PX = 320

/**
 * The band of empty canvas kept below the caret, in pixels, for a scroll
 * container of `viewportHeight`. Proportional so a tall window reads the same
 * as a short one, floored and capped so neither extreme gets silly.
 */
export function caretFloorOffset(viewportHeight: number): number {
  const proportional = Math.min(
    Math.max(viewportHeight * CARET_FLOOR_FRACTION, CARET_FLOOR_MIN_PX),
    CARET_FLOOR_MAX_PX,
  )
  // Never reserve more than half the viewport: a short pane — a small window,
  // or a phone with the keyboard up — must keep the caret in its upper half
  // rather than push it off the top.
  return Math.min(proportional, viewportHeight / 2)
}

interface CaretRunwayGeometry {
  /** Viewport-space bottom edge of the caret. */
  caretBottom: number
  /** Viewport-space top edge of the scroll container. */
  viewportTop: number
  /** Visible height of the scroll container. */
  viewportHeight: number
}

/**
 * How far to scroll down so the caret clears the bottom runway; `0` when it
 * already does. Never negative: the runway only ever pushes content up, so it
 * can neither fight ProseMirror's own scroll-into-view nor yank a caret that
 * already sits comfortably high.
 */
export function caretRunwayScroll({
  caretBottom,
  viewportTop,
  viewportHeight,
}: CaretRunwayGeometry): number {
  const floor = viewportTop + viewportHeight - caretFloorOffset(viewportHeight)
  return Math.max(0, Math.round(caretBottom - floor))
}

/**
 * Keeps the caret off the floor of the canvas while typing: once it reaches
 * the bottom band the note scrolls under it line by line, so the line being
 * written rests around two thirds up instead of hugging the bottom edge.
 * `.dayjot-bottom-runway` supplies the scroll room that makes this reachable
 * at the end of a note.
 *
 * Mounted inside the note pane's ProseKit context (like `EditorInputTraits`),
 * never around the one-line task editors — a caret floor there would scroll
 * the list behind them.
 *
 * Driven by `beforeinput` rather than `selectionchange`, so only typing moves
 * the view: clicking or arrowing into the bottom band leaves the scroll
 * exactly where the reader put it. Composition is left alone and settled at
 * `compositionend`, so an IME's marked text and candidate window never move
 * mid-word.
 */
export function CaretRunway(): null {
  const editor = useEditor()

  useEffect(() => {
    let frame: number | null = null
    let teardown: (() => void) | null = null

    // The same mount dance as EditorInputTraits: ProseKit attaches the view
    // via ref before effects run, so this attaches immediately in practice —
    // but the timing is ProseKit's, so a not-yet-mounted editor retries per
    // frame instead of silently doing nothing.
    const attach = (): void => {
      if (!editor.mounted) {
        frame = requestAnimationFrame(attach)
        return
      }
      frame = null
      const view = editor.view
      const dom = view.dom
      let pending: number | null = null

      function settle(): void {
        pending = null
        if (!editor.mounted || view.composing) {
          return
        }
        const container = findScrollContainer(dom)
        if (container === null) {
          return
        }
        // A caret beside an atom mark view (wiki link, image, file pill) can
        // measure as a dimensionless point; a bogus rect resolves to "already
        // above the floor" and simply does nothing.
        let caretBottom: number
        try {
          caretBottom = view.coordsAtPos(view.state.selection.head, 1).bottom
        } catch {
          return
        }
        const delta = caretRunwayScroll({
          caretBottom,
          viewportTop: container.getBoundingClientRect().top,
          viewportHeight: container.clientHeight,
        })
        if (delta > 0) {
          container.scrollTop += delta
        }
      }

      // One correction per frame, after the edit has reached the DOM.
      function schedule(): void {
        if (pending === null) {
          pending = requestAnimationFrame(settle)
        }
      }

      dom.addEventListener('beforeinput', schedule)
      dom.addEventListener('compositionend', schedule)
      teardown = () => {
        dom.removeEventListener('beforeinput', schedule)
        dom.removeEventListener('compositionend', schedule)
        if (pending !== null) {
          cancelAnimationFrame(pending)
        }
      }
    }

    attach()
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      teardown?.()
    }
  }, [editor])

  return null
}
