import { useCallback, useEffect, useState, type RefObject } from 'react'
import { findScrollContainer } from '@/lib/scroll-container'
import {
  extractOutlineEntries,
  outlineEntriesEqual,
  type OutlineEntry,
} from './outline-entries'

/**
 * Breathing room (px) left above a heading when jumping to it — matches the
 * note column's `py-8`, so a jumped-to heading sits exactly where the note's
 * own top padding would put it (the settings navigator's contract).
 */
export const OUTLINE_JUMP_OFFSET_PX = 32

/**
 * The reading line: a heading's section is active while it is the last one
 * whose top has crossed this many pixels below the container's top edge.
 * Sits just under the jump offset so jumping to an entry lands with that
 * entry active.
 */
const ACTIVATION_LINE_PX = OUTLINE_JUMP_OFFSET_PX + 16

/** What the outline rail renders: the headings, the one being read, and the jump. */
export interface NoteOutline {
  entries: OutlineEntry[]
  /** Index into {@link entries} of the section being read; 0 when empty. */
  activeIndex: number
  /** Scroll the note so the entry's heading lands just below the pane top. */
  jumpTo: (index: number) => void
}

/**
 * The current note's outline, read live from the editor mounted inside the
 * scroll container that `anchorRef` (the rail's own node) renders in. A
 * MutationObserver keeps the entries current while the user types — the
 * editor is uncontrolled and exposes no document-change event to chrome —
 * and the scroll/resize tracking mirrors `useActiveSettingsSection`. With
 * `enabled` false (the outline setting is off, so the rail renders nothing)
 * every observer stays disconnected.
 */
export function useNoteOutline(
  anchorRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): NoteOutline {
  const [entries, setEntries] = useState<OutlineEntry[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!enabled || anchor === null) {
      setEntries([])
      return
    }
    const container = findScrollContainer(anchor)
    if (container === null) {
      return
    }
    let frame = 0
    const recompute = (): void => {
      const editorRoot = container.querySelector('.dayjot-note-surface')
      const next = editorRoot === null ? [] : extractOutlineEntries(editorRoot)
      setEntries((previous) => (outlineEntriesEqual(previous, next) ? previous : next))
    }
    const observer = new MutationObserver((mutations) => {
      // The rail renders inside the same scroll container; its own DOM
      // updates (active tick, popover trigger state) must not loop back
      // into recomputation.
      if (mutations.every((mutation) => anchor.contains(mutation.target))) {
        return
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(recompute)
    })
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    recompute()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [anchorRef, enabled])

  useEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null || entries.length === 0) {
      setActiveIndex(0)
      return
    }
    const container = findScrollContainer(anchor)
    if (container === null) {
      return
    }
    const compute = (): void => {
      const containerTop = container.getBoundingClientRect().top
      let current = 0
      entries.forEach((entry, index) => {
        if (entry.element.getBoundingClientRect().top - containerTop <= ACTIVATION_LINE_PX) {
          current = index
        }
      })
      // Scrolled to the very bottom, the last section wins: a short final
      // section may never reach the reading line on its own.
      const atBottom =
        container.scrollTop > 0 &&
        container.scrollTop + container.clientHeight >= container.scrollHeight - 1
      setActiveIndex(atBottom ? entries.length - 1 : current)
    }
    compute()
    // ScrollRestored restores a saved scrollTop in its own effect, which runs
    // after this one; recompute in a microtask so a revisited note starts on
    // the right entry (the settings navigator's exact workaround).
    queueMicrotask(compute)
    container.addEventListener('scroll', compute, { passive: true })
    const resizeObserver = new ResizeObserver(compute)
    resizeObserver.observe(container)
    return () => {
      container.removeEventListener('scroll', compute)
      resizeObserver.disconnect()
    }
  }, [anchorRef, entries])

  const jumpTo = useCallback(
    (index: number) => {
      const anchor = anchorRef.current
      const entry = entries[index]
      if (anchor === null || entry === undefined) {
        return
      }
      const container = findScrollContainer(anchor)
      if (container === null) {
        return
      }
      const offset =
        entry.element.getBoundingClientRect().top - container.getBoundingClientRect().top
      const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 'auto'
        : 'smooth'
      container.scrollTo({
        top: Math.max(0, container.scrollTop + offset - OUTLINE_JUMP_OFFSET_PX),
        behavior,
      })
    },
    [anchorRef, entries],
  )

  return { entries, activeIndex, jumpTo }
}
