import {
  findKeepMarkerTokens,
  pairKeepMarkers,
  type KeepMarkerToken,
  type KeepPair,
} from './keep-marker'
import type { ParsedKeepsake, Span, WikiLink } from './model'
import { plainTextOfRange } from './plain-text'

/** What {@link collectKeepsakes} reads from one parse of a note body. */
export interface KeepsakeParseInput {
  body: string
  /** Where `body` starts in the original file (the frontmatter's length). */
  bodyOffset: number
  /** Body-coordinate regions where a marker is literal text (code, URLs, wiki links). */
  excluded: Span[]
  /** Body-coordinate syntax ranges the plain text drops. */
  cuts: Span[]
  /** Body-coordinate regions whose backslashes render literally (code). */
  literalRanges: Span[]
  /** The note's wiki links, in **file** coordinates, in document order. */
  wikiLinks: WikiLink[]
}

// The block syntax in front of a line's words: indentation, quote markers, one
// list marker, a task checkbox, and ATX heading hashes. A `#keep` opener never
// matches the heading arm — ATX hashes need whitespace after them.
const BLOCK_PREFIX_RE =
  /^[\t ]*(?:>[\t ]?)*[\t ]*(?:(?:[-*+]|\d{1,9}[.)])[\t ]+)?(?:\[[^\]\n]\][\t ]+)?(?:#{1,6}[\t ]+)?/

/** Start of the physical line containing `index`. */
function lineStartAt(body: string, index: number): number {
  return body.lastIndexOf('\n', index - 1) + 1
}

/** End of the physical line containing `index` (its `\n`, or the body's end). */
function lineEndAt(body: string, index: number): number {
  const newline = body.indexOf('\n', index)
  return newline === -1 ? body.length : newline
}

/** Where the words of the line starting at `lineStart` begin, past its block syntax. */
function contentStartOf(body: string, lineStart: number): number {
  const line = body.slice(lineStart, lineEndAt(body, lineStart))
  return lineStart + (BLOCK_PREFIX_RE.exec(line)?.[0].length ?? 0)
}

function inAnyRange(index: number, ranges: readonly Span[]): boolean {
  return ranges.some((range) => index >= range.from && index < range.to)
}

/**
 * The span to drop for a marker, with the one run of spaces that separated it
 * from the words. A marker leading its line takes the spaces after it
 * (`#keep [[SD]] …`); anywhere else it takes the spaces before it
 * (`… 实现 #keep-end`), so the words close up exactly as they were written.
 */
function markerRemoval(body: string, marker: Span): Span {
  const contentStart = contentStartOf(body, lineStartAt(body, marker.from))
  if (body.slice(contentStart, marker.from).trim() === '') {
    let to = marker.to
    while (body[to] === ' ' || body[to] === '\t') {
      to += 1
    }
    return { from: marker.from, to }
  }
  let from = marker.from
  while (from > contentStart && (body[from - 1] === ' ' || body[from - 1] === '\t')) {
    from -= 1
  }
  return { from, to: marker.to }
}

/** `body[from, to)` with every removal span cut out. */
function sliceWithout(body: string, from: number, to: number, removals: readonly Span[]): string {
  const sorted = [...removals].sort((left, right) => left.from - right.from)
  let result = ''
  let pos = from
  for (const removal of sorted) {
    if (removal.to <= pos || removal.from >= to) {
      continue
    }
    result += body.slice(pos, Math.max(pos, removal.from))
    pos = Math.min(to, removal.to)
  }
  return result + body.slice(pos, to)
}

/**
 * A section's Markdown on its own: blank edge lines dropped (a marker alone on
 * its line leaves one) and the common indentation removed, so a section cut
 * from inside a nested list still parses as a list.
 */
function standalone(markdown: string): string {
  const lines = markdown.split('\n').map((line) => line.replace(/[\t ]+$/u, ''))
  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  const indents = lines
    .filter((line) => line !== '')
    .map((line) => /^[\t ]*/u.exec(line)?.[0].length ?? 0)
  const indent = indents.length === 0 ? 0 : Math.min(...indents)
  return lines.map((line) => line.slice(indent)).join('\n')
}

/**
 * The first line in `[from, to)` still holding words once `removals` are cut,
 * as `[contentStart, lineEnd)` — a keepsake's head line, where its subjects
 * are read. Null when every line is blank.
 */
function headLine(
  body: string,
  from: number,
  to: number,
  removals: readonly Span[],
): Span | null {
  for (let lineStart = from; lineStart < to; lineStart = lineEndAt(body, lineStart) + 1) {
    const lineEnd = Math.min(to, lineEndAt(body, lineStart))
    const contentStart = contentStartOf(body, lineStart)
    if (sliceWithout(body, contentStart, lineEnd, removals).trim() !== '') {
      return { from: contentStart, to: lineEnd }
    }
  }
  return null
}

/**
 * The wiki link a head line opens with (past its block syntax and any marker),
 * as a removal span that also takes the spaces after it, or null.
 */
function leadingLink(
  body: string,
  head: Span,
  removals: readonly Span[],
  links: readonly WikiLink[],
  bodyOffset: number,
): { target: string; removal: Span } | null {
  let pos = head.from
  for (;;) {
    const removal = removals.find((span) => span.from === pos)
    if (removal !== undefined) {
      pos = removal.to
    } else if (body[pos] === ' ' || body[pos] === '\t') {
      pos += 1
    } else {
      break
    }
  }
  const link = links.find((candidate) => candidate.from - bodyOffset === pos)
  if (link === undefined) {
    return null
  }
  let to = link.to - bodyOffset
  while (body[to] === ' ' || body[to] === '\t') {
    to += 1
  }
  return { target: link.target, removal: { from: pos, to } }
}

/**
 * Every keepsake in a note body, in document order.
 *
 * Markers are read with the tag grammar's rules — one inside a code span, a
 * code block, a URL, or a wiki link is literal text — then paired by
 * {@link pairKeepMarkers}. A lone `#keep` keeps its **physical line**, shown
 * as the words alone (block syntax dropped). A `#keep` … `#keep-end` pair keeps
 * every line from the opener's through the closer's, verbatim — lists, code
 * blocks and all — minus the two markers. A keepsake with no words (a bare
 * `#keep` line) yields nothing.
 */
export function collectKeepsakes(input: KeepsakeParseInput): ParsedKeepsake[] {
  const tokens = findKeepMarkerTokens(input.body).filter(
    (token) => !inAnyRange(token.from, input.excluded),
  )
  const keepsakes: ParsedKeepsake[] = []
  for (const pair of pairKeepMarkers(tokens)) {
    const keepsake = readKeepsake(input, pair)
    if (keepsake !== null) {
      keepsakes.push(keepsake)
    }
  }
  return keepsakes
}

/** One paired keepsake, or null when it holds no words. */
function readKeepsake(
  input: KeepsakeParseInput,
  pair: KeepPair<KeepMarkerToken>,
): ParsedKeepsake | null {
  const { body, bodyOffset, cuts, literalRanges, wikiLinks } = input
  const { open, close } = pair
  const from = lineStartAt(body, open.from)
  const to = lineEndAt(body, (close ?? open).from)
  const markers = close === null ? [open] : [open, close]
  const text = plainTextOfRange(body, from, to, [...cuts, ...markers], literalRanges).trim()
  const removals = markers.map((marker) => markerRemoval(body, marker))
  const head = headLine(body, from, to, removals)
  if (text === '' || head === null) {
    return null
  }
  const headLinks = wikiLinks.filter(
    (link) => link.from - bodyOffset >= head.from && link.from - bodyOffset < head.to,
  )
  const lead = leadingLink(body, head, removals, headLinks, bodyOffset)
  const render = (spans: readonly Span[]): string =>
    close === null
      ? sliceWithout(body, contentStartOf(body, from), to, spans).trim()
      : standalone(sliceWithout(body, from, to, spans))
  const markdown = render(removals)
  return {
    markerOffset: open.from + bodyOffset,
    markerIndex: pair.index,
    kind: close === null ? 'line' : 'section',
    text,
    markdown,
    links: headLinks.map((link) => link.target),
    leadLink: lead?.target ?? null,
    markdownAfterLead: lead === null ? markdown : render([...removals, lead.removal]),
  }
}
