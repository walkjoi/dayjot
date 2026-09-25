import type { Span } from './model'
import { foldTag } from './keys'

/**
 * The reserved `#keep` / `#keep-end` tags — the Keep gesture's markers.
 *
 * Keeping promotes words to a *keepsake*: a fragment worth more than the day
 * it was written on, collected into the Keepsakes view. A lone `#keep` keeps
 * the line it sits on; a `#keep` answered later by `#keep-end` keeps the whole
 * contiguous section from the opener's line through the closer's line.
 *
 * The markers are ordinary `#tag`s on purpose, so they need no grammar of
 * their own — the one canonical Lezer grammar already parses them, they
 * round-trip through any other Markdown editor, and they stay greppable in the
 * notes folder.
 *
 * The cost of borrowing the tag namespace is that the markers would otherwise
 * crowd tag autocomplete and tag counts on every note carrying one, so
 * {@link isReservedTag} excludes them from those surfaces.
 */

/** The reserved tag name that opens a keepsake, without its `#`. */
export const KEEP_TAG = 'keep'

/** The reserved tag name that closes a kept section, without its `#`. */
export const KEEP_END_TAG = 'keep-end'

/** The opening marker as written in the note. */
export const KEEP_MARKER = `#${KEEP_TAG}`

/** The closing marker as written in the note. */
export const KEEP_END_MARKER = `#${KEEP_END_TAG}`

/**
 * Folded names of the tags DayJot gives its own meaning to. They are still real
 * tags on disk and a typed `#keep` still filters search — they are just never
 * *offered*, so they cannot crowd tag autocomplete or the All Notes tag facets.
 */
export const RESERVED_TAG_KEYS: readonly string[] = [KEEP_TAG, KEEP_END_TAG]

const RESERVED_TAGS: ReadonlySet<string> = new Set(RESERVED_TAG_KEYS)

/**
 * Is `tag` (without its `#`) one DayJot reserves? Tags match case-insensitively,
 * so `#Keep` is the same reserved marker as `#keep`.
 */
export function isReservedTag(tag: string): boolean {
  return RESERVED_TAGS.has(foldTag(tag))
}

/** Whether a marker opens a keepsake (`#keep`) or closes a section (`#keep-end`). */
export type KeepMarkerKind = 'open' | 'close'

/** One marker token: its kind and the span covering the token itself. */
export interface KeepMarkerToken extends Span {
  kind: KeepMarkerKind
}

// A marker as a whole tag token: the same boundary rule the tag grammar uses
// (start-of-text or whitespace before the `#`), and no trailing tag characters,
// so `#keeping` and `#keep/sake` are ordinary tags rather than markers. The
// closer is tried first so `#keep-end` never reads as `#keep` plus text.
const KEEP_TOKEN_RE = new RegExp(
  String.raw`(^|\s)#(${KEEP_END_TAG}|${KEEP_TAG})(?![\p{L}\p{N}/_-])`,
  'giu',
)

/**
 * Every `#keep` and `#keep-end` token in `text`, in document order, as spans
 * covering the marker itself — the leading boundary whitespace is not
 * included. Offsets are relative to `text`; callers holding body coordinates
 * add their own `bodyOffset`.
 */
export function findKeepMarkerTokens(text: string): KeepMarkerToken[] {
  const tokens: KeepMarkerToken[] = []
  for (const match of text.matchAll(KEEP_TOKEN_RE)) {
    // Both groups are mandatory in the pattern, so a match populates them.
    const from = (match.index ?? 0) + match[1]!.length
    const name = match[2]!
    tokens.push({
      kind: foldTag(name) === KEEP_END_TAG ? 'close' : 'open',
      from,
      to: from + 1 + name.length,
    })
  }
  return tokens
}

/** Every opening `#keep` token in `text` — see {@link findKeepMarkerTokens}. */
export function findKeepMarkers(text: string): Span[] {
  return findKeepMarkerTokens(text)
    .filter((token) => token.kind === 'open')
    .map(({ from, to }) => ({ from, to }))
}

/**
 * One keepsake's markers: the opener, the closer when the keepsake is a
 * section, and the opener's ordinal among every opener in the note — the
 * stable address the editor uses to find the keepsake again.
 */
export interface KeepPair<T> {
  open: T
  /** The `#keep-end` answering {@link open}, or null for a single kept line. */
  close: T | null
  index: number
}

/**
 * Pair a note's marker tokens (in document order) into keepsakes.
 *
 * A closer answers the nearest opener before it that is still open. An opener
 * followed by another opener before any closer is a single kept line, as is an
 * opener nothing answers. A closer with no open opener is ignored — the words
 * around it simply aren't kept. Sections therefore never nest or overlap, and
 * the rule is the same wherever markers are read: the index, the Keepsakes
 * view, and the editor's toggle.
 */
export function pairKeepMarkers<T extends { kind: KeepMarkerKind }>(
  tokens: readonly T[],
): KeepPair<T>[] {
  const pairs: KeepPair<T>[] = []
  let pending: KeepPair<T> | null = null
  let openers = 0
  for (const token of tokens) {
    if (token.kind === 'open') {
      if (pending !== null) {
        pairs.push(pending)
      }
      pending = { open: token, close: null, index: openers }
      openers += 1
      continue
    }
    if (pending !== null) {
      pairs.push({ ...pending, close: token })
      pending = null
    }
  }
  if (pending !== null) {
    pairs.push(pending)
  }
  return pairs
}
