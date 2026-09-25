import {
  findKeepMarkers,
  findKeepMarkerTokens,
  KEEP_END_MARKER,
  KEEP_MARKER,
  pairKeepMarkers,
  type KeepMarkerKind,
  type KeepPair,
} from '@dayjot/core'
import type { ProseMirrorNode } from '@prosekit/pm/model'
import type { EditorState, Transaction } from '@prosekit/pm/state'

/**
 * The Keep gesture's edits, over a line of text and over the editor document.
 *
 * Keeping writes the reserved markers into the note itself — `#keep` at the
 * start of a kept line, and for a kept section a `#keep-end` after its last
 * words — so the file stays the source of truth and the Keepsakes view is a
 * projection of what the text already says. Unkeeping removes only the
 * markers: **the words are never deleted**, they just stop being kept.
 *
 * Markers pair exactly as the parser pairs them ({@link pairKeepMarkers}), so
 * what the toggle sees as kept is what the Keepsakes view shows.
 */

/** A text splice relative to one line: replace `[from, to)` with `text`. */
export interface LineEdit {
  from: number
  to: number
  text: string
}

// One placeholder per inline leaf keeps every string offset aligned with
// `contentStart + offset` in the document.
const LEAF_PLACEHOLDER = '￼'

// Inline marks under which a marker is literal text — the editor-side twin of
// the parser's tag exclusions (inline code, link URLs, wiki links).
const LITERAL_MARK_NAMES = ['mdCode', 'mdLinkUri', 'mdWikilink'] as const

function isBlank(character: string | undefined): boolean {
  return character === ' ' || character === '\t'
}

/**
 * The span to cut for the marker at `[from, to)` of `line`, with the one run of
 * spaces that set it apart: the spaces after a marker that leads its line
 * (`#keep 那句话`), the spaces before one anywhere else (`那句话 #keep`). The
 * parser drops the same spans, so a line reads the same kept or unkept.
 */
export function markerCut(line: string, from: number, to: number): LineEdit {
  if (line.slice(0, from).trim() === '') {
    let end = to
    while (isBlank(line[end])) {
      end += 1
    }
    return { from, to: end, text: '' }
  }
  let start = from
  while (start > 0 && isBlank(line[start - 1])) {
    start -= 1
  }
  return { from: start, to, text: '' }
}

/**
 * How ⌘⇧B toggles a single `line`, or null when there is nothing to toggle.
 *
 * An unkept line gains `#keep ` at its start — a label for what follows, the
 * way a hand-written `#keep [[SD]] …` reads. A kept line loses its marker: the
 * one leading the line when there is one, else the last (an older, trailing
 * `… #keep`), leaving any earlier `#keep` written as prose where it was. A
 * blank line is left alone: a bare `#keep` is a marker with nothing kept.
 *
 * `openers` are the line's opening markers; they default to every `#keep`
 * token, and the editor passes only those its marks don't make literal.
 */
export function keepMarkEdit(
  line: string,
  openers: readonly { from: number; to: number }[] = findKeepMarkers(line),
): LineEdit | null {
  if (openers.length > 0) {
    const leading = openers.find((span) => line.slice(0, span.from).trim() === '')
    const target = leading ?? openers[openers.length - 1]!
    return markerCut(line, target.from, target.to)
  }
  if (line.trim() === '') {
    return null
  }
  return { from: 0, to: line.length - line.trimStart().length, text: `${KEEP_MARKER} ` }
}

/**
 * How a section's last line gains its `#keep-end`: after the last word,
 * replacing trailing whitespace so the marker never lands past the sentence.
 */
export function keepEndEdit(line: string): LineEdit {
  const trimmed = line.replace(/\s+$/u, '')
  return {
    from: trimmed.length,
    to: line.length,
    text: trimmed === '' ? KEEP_END_MARKER : ` ${KEEP_END_MARKER}`,
  }
}

/** A textblock and the document position just before it. */
interface Textblock {
  node: ProseMirrorNode
  pos: number
}

/** A marker token placed in the document. */
interface DocMarker {
  kind: KeepMarkerKind
  from: number
  to: number
  block: Textblock
}

/** One edit of the toggle's transaction, in document positions. */
type DocEdit =
  | { kind: 'text'; from: number; to: number; text: string }
  | { kind: 'line'; at: number; text: string }

function contentStart(block: Textblock): number {
  return block.pos + 1
}

function isCodeBlock(block: Textblock): boolean {
  return Boolean(block.node.type.spec.code)
}

function textOf(block: Textblock): string {
  return block.node.textBetween(0, block.node.content.size, LEAF_PLACEHOLDER, LEAF_PLACEHOLDER)
}

/** `edit` (relative to `block`'s text) as a document edit. */
function inBlock(block: Textblock, edit: LineEdit): DocEdit {
  const start = contentStart(block)
  return { kind: 'text', from: start + edit.from, to: start + edit.to, text: edit.text }
}

/**
 * Every marker in `doc`, in document order. Code blocks keep `#keep` literal,
 * as do inline code, link URLs, and wiki links — the same regions the parser
 * skips — so the toggle and the Keepsakes view always agree on what is kept.
 */
function keepMarkersIn(doc: ProseMirrorNode): DocMarker[] {
  const literalMarks = LITERAL_MARK_NAMES.flatMap((name) => {
    const type = doc.type.schema.marks[name]
    return type === undefined ? [] : [type]
  })
  const markers: DocMarker[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    const block = { node, pos }
    if (isCodeBlock(block)) {
      return false
    }
    const start = contentStart(block)
    for (const token of findKeepMarkerTokens(textOf(block))) {
      const from = start + token.from
      const to = start + token.to
      if (!literalMarks.some((type) => doc.rangeHasMark(from, to, type))) {
        markers.push({ kind: token.kind, from, to, block })
      }
    }
    return false
  })
  return markers
}

/**
 * The textblocks a selection covers words of, in document order. A range that
 * merely touches a block's edge (a line selected through to the start of the
 * next) doesn't cover it; a caret covers the block it sits in.
 */
function coveredTextblocks(doc: ProseMirrorNode, from: number, to: number): Textblock[] {
  const blocks: Textblock[] = []
  if (from < to) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) {
        return true
      }
      const start = pos + 1
      if (start + node.content.size > from && start < to) {
        blocks.push({ node, pos })
      }
      return false
    })
  }
  if (blocks.length === 0) {
    const $from = doc.resolve(from)
    if ($from.parent.isTextblock) {
      blocks.push({ node: $from.parent, pos: $from.before() })
    }
  }
  return blocks
}

/** Whether a section's blocks overlap `[from, to]`. */
function sectionOverlaps(pair: KeepPair<DocMarker>, from: number, to: number): boolean {
  if (pair.close === null) {
    return false
  }
  const start = pair.open.block.pos
  const end = pair.close.block.pos + pair.close.block.node.nodeSize
  return start <= to && end >= from
}

/**
 * The edit that takes `marker` off. A paragraph holding nothing but the marker
 * — the line a section gains before or after a code block — goes entirely,
 * unless it is the only block its parent has.
 */
function removeMarker(doc: ProseMirrorNode, marker: DocMarker): DocEdit {
  const { block } = marker
  const text = textOf(block)
  const start = contentStart(block)
  const alone = text.trim() === text.slice(marker.from - start, marker.to - start)
  if (alone && block.node.type.name === 'paragraph' && doc.resolve(block.pos).parent.childCount > 1) {
    return { kind: 'text', from: block.pos, to: block.pos + block.node.nodeSize, text: '' }
  }
  return inBlock(block, markerCut(text, marker.from - start, marker.to - start))
}

/** Whether a new paragraph may be inserted at `at`. */
function canInsertLine(doc: ProseMirrorNode, at: number): boolean {
  const $at = doc.resolve(at)
  const paragraph = doc.type.schema.nodes['paragraph']
  return paragraph !== undefined && $at.parent.canReplaceWith($at.index(), $at.index(), paragraph)
}

/**
 * The edits that keep `blocks` (two or more, in order) as one section: an
 * opener leading the first block unless it already carries one, a closer after
 * the last block's words, and every other marker inside dropped — a line kept
 * on its own is absorbed into the section, and sections never nest. A code
 * block can't hold a marker, so one at either edge gets a marker line beside it.
 */
function keepSection(doc: ProseMirrorNode, blocks: Textblock[], markers: DocMarker[]): DocEdit[] | null {
  const first = blocks[0]!
  const last = blocks[blocks.length - 1]!
  const end = last.pos + last.node.nodeSize
  const inside = markers.filter((marker) => marker.from >= first.pos && marker.to <= end)
  const opener =
    inside.find((marker) => marker.kind === 'open' && marker.block.pos === first.pos) ?? null
  const edits = inside.filter((marker) => marker !== opener).map((marker) => removeMarker(doc, marker))

  if (opener === null) {
    if (isCodeBlock(first)) {
      if (!canInsertLine(doc, first.pos)) {
        return null
      }
      edits.push({ kind: 'line', at: first.pos, text: KEEP_MARKER })
    } else {
      const text = textOf(first)
      edits.push(inBlock(first, keepMarkEdit(text, []) ?? { from: 0, to: text.length, text: KEEP_MARKER }))
    }
  }
  if (isCodeBlock(last)) {
    if (!canInsertLine(doc, end)) {
      return null
    }
    edits.push({ kind: 'line', at: end, text: KEEP_END_MARKER })
  } else {
    edits.push(inBlock(last, keepEndEdit(textOf(last))))
  }
  return edits
}

/** Apply non-overlapping `edits` as one transaction, last position first. */
function applyEdits(state: EditorState, edits: DocEdit[]): Transaction {
  const startOf = (edit: DocEdit): number => (edit.kind === 'line' ? edit.at : edit.from)
  const isDeletion = (edit: DocEdit): boolean => edit.kind === 'text' && edit.text === ''
  const ordered = [...edits].sort(
    (left, right) =>
      startOf(right) - startOf(left) || Number(isDeletion(right)) - Number(isDeletion(left)),
  )
  const { tr, schema } = state
  for (const edit of ordered) {
    if (edit.kind === 'line') {
      tr.insert(edit.at, schema.nodes['paragraph']!.create(null, schema.text(edit.text)))
    } else if (edit.text === '') {
      tr.delete(edit.from, edit.to)
    } else {
      tr.insertText(edit.text, edit.from, edit.to)
    }
  }
  return tr.scrollIntoView()
}

/**
 * The ⌘⇧B transaction for `state`'s selection, or null when there is nothing
 * to keep or unkeep.
 *
 * - Inside a kept section (a caret or a selection touching it): unkeep the
 *   section — both markers go, the words stay.
 * - A caret, or a selection within one line: toggle that line's `#keep`.
 * - A selection across lines: keep them as one section (`#keep` … `#keep-end`).
 */
export function keepToggleTransaction(state: EditorState): Transaction | null {
  const { doc, selection } = state
  const markers = keepMarkersIn(doc)
  const pairs = pairKeepMarkers(markers)
  const sections = pairs.filter((pair) => sectionOverlaps(pair, selection.from, selection.to))
  if (sections.length > 0) {
    return applyEdits(
      state,
      sections.flatMap((pair) => [pair.open, pair.close!].map((marker) => removeMarker(doc, marker))),
    )
  }

  const blocks = coveredTextblocks(doc, selection.from, selection.to)
  if (blocks.length > 1) {
    const edits = keepSection(doc, blocks, markers)
    return edits === null ? null : applyEdits(state, edits)
  }

  const block = blocks[0]
  if (block === undefined || isCodeBlock(block)) {
    return null
  }
  const start = contentStart(block)
  const ownOpeners = markers.filter((marker) => marker.kind === 'open' && marker.block.pos === block.pos)
  const edit = keepMarkEdit(
    textOf(block),
    ownOpeners.map((marker) => ({ from: marker.from - start, to: marker.to - start })),
  )
  if (edit === null) {
    return null
  }
  const edits = [inBlock(block, edit)]
  // A new opener pairs with the next closer after it. Outside every section,
  // such a closer is a stray one (its opener deleted by hand), and it must not
  // turn this line into a section running down to it.
  const next = markers.find((marker) => marker.from >= block.pos + block.node.nodeSize)
  if (ownOpeners.length === 0 && next?.kind === 'close') {
    edits.push(removeMarker(doc, next))
  }
  return applyEdits(state, edits)
}

/**
 * Where the note's `markerIndex`-th `#keep` sits — the start of its line, and
 * the position of that line's block — or null when the note no longer has
 * that many. The Keepsakes view addresses a keepsake by this ordinal, which the
 * parser counts the same way.
 */
export function keepsakeLocation(
  doc: ProseMirrorNode,
  markerIndex: number,
): { caret: number; blockPos: number } | null {
  const opener = keepMarkersIn(doc).filter((marker) => marker.kind === 'open')[markerIndex]
  return opener === undefined
    ? null
    : { caret: contentStart(opener.block), blockPos: opener.block.pos }
}
