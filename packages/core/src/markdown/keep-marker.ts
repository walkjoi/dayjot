import type { Span } from './model'
import { foldTag } from './keys'

/**
 * The reserved `#keep` tag — the Keep gesture's marker.
 *
 * Keeping a line promotes it to a *keepsake*: a fragment worth more than the
 * day it was written on, collected into the Keepsakes view. The marker is an
 * ordinary `#tag` on purpose, so it needs no grammar of its own — the one
 * canonical Lezer grammar already parses it, it round-trips through any other
 * Markdown editor, and it stays greppable in the notes folder.
 *
 * The cost of borrowing the tag namespace is that `#keep` would otherwise
 * crowd tag autocomplete and tag counts on every note carrying one, so
 * {@link isReservedTag} excludes it from those surfaces.
 */

/** The reserved tag name, without its `#`. */
export const KEEP_TAG = 'keep'

/** The marker as written in the note. */
export const KEEP_MARKER = `#${KEEP_TAG}`

/** The separator the toggle puts before an appended marker. */
export const KEEP_MARKER_SUFFIX = ` ${KEEP_MARKER}`

/**
 * Folded names of the tags DayJot gives its own meaning to. They are still real
 * tags on disk and a typed `#keep` still filters search — they are just never
 * *offered*, so they cannot crowd tag autocomplete or the All Notes tag facets.
 */
export const RESERVED_TAG_KEYS: readonly string[] = [KEEP_TAG]

const RESERVED_TAGS: ReadonlySet<string> = new Set(RESERVED_TAG_KEYS)

/**
 * Is `tag` (without its `#`) one DayJot reserves? Tags match case-insensitively,
 * so `#Keep` is the same reserved marker as `#keep`.
 */
export function isReservedTag(tag: string): boolean {
  return RESERVED_TAGS.has(foldTag(tag))
}

// The marker as a whole tag token: the same boundary rule the tag grammar uses
// (start-of-text or whitespace before the `#`), and no trailing tag characters,
// so `#keeping` and `#keep/sake` are ordinary tags rather than the marker.
const KEEP_MARKER_RE = new RegExp(
  String.raw`(^|\s)#${KEEP_TAG}(?![\p{L}\p{N}/_-])`,
  'giu',
)

/**
 * Every `#keep` token in `text`, as spans covering the marker itself — the
 * leading boundary whitespace is not included. Offsets are relative to `text`;
 * callers holding body coordinates add their own `bodyOffset`.
 */
export function findKeepMarkers(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(KEEP_MARKER_RE)) {
    // The boundary group is mandatory in the pattern, so a match populates it.
    const from = (match.index ?? 0) + match[1]!.length
    spans.push({ from, to: from + KEEP_MARKER.length })
  }
  return spans
}

/**
 * The span of `text`'s last `#keep` token, or `null` when it carries none.
 * The toggle removes this one: a line is kept or it isn't, and removing the
 * marker nearest the end leaves any earlier prose (`talked about #keep` in a
 * note *about* the feature) where the writer put it.
 */
export function lastKeepMarker(text: string): Span | null {
  const spans = findKeepMarkers(text)
  return spans.length === 0 ? null : spans[spans.length - 1]!
}
