/**
 * Heading extraction for the note outline rail: reads the mounted editor's
 * DOM rather than the ProseMirror document, so the rail needs no new editor
 * API surface and keeps working across editor remounts. Headings render as
 * plain `h1`–`h6` elements inside the `.dayjot-note-surface` root; the only
 * meowdown detail this layer knows is that hidden markdown syntax (`# `,
 * `**`, …) stays in the DOM as `.md-mark` spans, which must be stripped to
 * get the display text.
 */

/** One heading in the current note, in document order. */
export interface OutlineEntry {
  /** The heading's DOM element inside the editor, used for scroll math. */
  readonly element: HTMLElement
  /** The heading's own depth, 1–6 (`h2` → 2), not normalized. */
  readonly level: number
  /** Display text with markdown syntax marks stripped and whitespace collapsed. */
  readonly text: string
  /** Whether this is the note's leading H1 — the title, the rail's "top" entry. */
  readonly isTitle: boolean
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

/**
 * A heading's user-visible text: markdown syntax marks removed (they are in
 * the DOM even when `mark-mode` hides them, so `textContent` alone would
 * leak `# ` into labels) and runs of whitespace collapsed to one space.
 */
export function headingDisplayText(heading: Element): string {
  const clone = heading.cloneNode(true) as Element
  for (const mark of clone.querySelectorAll('.md-mark')) {
    mark.remove()
  }
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * All headings of the note mounted at `editorRoot`, in document order.
 * Headings with no visible text are skipped — a bare `## ` being typed (or
 * the ghost-"Untitled" empty title) has nothing to point at yet.
 */
export function extractOutlineEntries(editorRoot: Element): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  for (const heading of editorRoot.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) {
    const text = headingDisplayText(heading)
    if (text === '') {
      continue
    }
    entries.push({
      element: heading,
      level: Number(heading.tagName.charAt(1)),
      text,
      isTitle: heading.tagName === 'H1' && heading === editorRoot.firstElementChild,
    })
  }
  return entries
}

/**
 * Whether two extractions describe the same outline — used to keep a
 * mutation-driven recompute from re-rendering the rail when nothing the rail
 * shows has changed (element identity covers position: a moved block is a
 * childList mutation whose re-extraction yields new order).
 */
export function outlineEntriesEqual(a: OutlineEntry[], b: OutlineEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index]!
      return (
        entry.element === other.element &&
        entry.level === other.level &&
        entry.text === other.text &&
        entry.isTitle === other.isTitle
      )
    })
  )
}
