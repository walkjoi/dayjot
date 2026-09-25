import { readNote } from '../graph/commands'
import { KEEP_TAG, normalizeWikiTarget, parseNote, type ParsedKeepsake } from '../markdown'
import { db } from './db'
import { inClauseChunks } from './query-utils'

/**
 * The Keepsakes projection — read at query time, with no table behind it.
 *
 * Keeping is deliberate and rare by design, so the graph holds a handful of
 * marked notes rather than thousands. That makes the existing tags index
 * enough: it names the notes carrying `#keep`, and those few are parsed on
 * read. The same shape as the backlinks panel's block context, and it keeps
 * the feature free of a migration.
 *
 * Private notes are included: this is a local-only surface, exactly like the
 * Tasks view.
 */

/**
 * A subject a keepsake names with a `[[wiki link]]` on its first line — what
 * the Keepsakes view groups by. Date links (`[[2026-09-09]]`) are days, not
 * subjects, so they never become one.
 */
export interface KeepsakeSubject {
  /** The link target as written, e.g. `DSA` — how the subject reads. */
  target: string
  /** The note the link resolves to, or null for a link to no note yet. */
  notePath: string | null
  /**
   * Group identity: the resolved note, so `[[DSA]]`, `[[dsa]]`, and an alias
   * of the same note are one subject — else the folded target.
   */
  key: string
}

/** One keepsake, with the note context the Keepsakes view renders. */
export interface Keepsake extends ParsedKeepsake {
  notePath: string
  noteTitle: string
  /** ISO date for daily-note keepsakes; null for keepsakes in regular notes. */
  dailyDate: string | null
  /** Note mtime, epoch ms — the recency key for keepsakes outside a daily note. */
  updatedAt: number
  /** The distinct subjects of {@link ParsedKeepsake.links}, in document order. */
  subjects: readonly KeepsakeSubject[]
}

/** The notes carrying the reserved marker, newest first. */
async function keptNotes(): Promise<
  { path: string; title: string; dailyDate: string | null; updatedAt: number }[]
> {
  return db
    .selectFrom('tags')
    .innerJoin('notes', 'notes.path', 'tags.notePath')
    .where('tags.tagKey', '=', KEEP_TAG)
    .where('notes.kind', '!=', 'template')
    .select(['notes.path', 'notes.title', 'notes.dailyDate', 'notes.updatedAt'])
    .execute()
}

/**
 * The day a keepsake belongs to for ordering: the note's own daily date when it
 * has one, else the day its file was last touched. Daily notes are the point of
 * the feature, and dating a stray keepsake by its note's mtime puts it in the
 * same stream rather than in a separate pile.
 */
function keepsakeDay(note: { dailyDate: string | null; updatedAt: number }): string {
  if (note.dailyDate !== null) {
    return note.dailyDate
  }
  const at = new Date(note.updatedAt)
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${at.getFullYear()}-${month}-${day}`
}

/** The folded, non-date link keys a subject can be read from; null for a date or blank link. */
function subjectKey(target: string): string | null {
  const normalized = normalizeWikiTarget(target)
  return normalized.date !== undefined || normalized.key === '' ? null : normalized.key
}

/**
 * The note each folded link key resolves to, through `note_keys` — the same
 * canonical address map wiki-link navigation uses, so a subject opens the note
 * a click on its link would.
 */
async function resolveSubjectKeys(keys: readonly string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  for (const chunk of inClauseChunks(keys)) {
    const rows = await db
      .selectFrom('noteKeys')
      .where('key', 'in', chunk)
      .select(['key', 'notePath'])
      .execute()
    for (const row of rows) {
      if (row.key !== null && row.notePath !== null) {
        resolved.set(row.key, row.notePath)
      }
    }
  }
  return resolved
}

/** A keepsake's links as distinct subjects, dates and blanks dropped. */
function subjectsOf(
  links: readonly string[],
  resolved: ReadonlyMap<string, string>,
): KeepsakeSubject[] {
  const subjects: KeepsakeSubject[] = []
  for (const target of links) {
    const key = subjectKey(target)
    if (key === null) {
      continue
    }
    const notePath = resolved.get(key) ?? null
    const subject = { target: target.trim(), notePath, key: notePath ?? `link:${key}` }
    if (!subjects.some((existing) => existing.key === subject.key)) {
      subjects.push(subject)
    }
  }
  return subjects
}

/**
 * Every keepsake across the graph, newest day first and in document order
 * within a note — the Keepsakes view's whole read, subjects resolved.
 *
 * A note the index still lists but the disk no longer holds (a deletion racing
 * this read) contributes nothing rather than failing the view.
 */
export async function getKeepsakes(): Promise<Keepsake[]> {
  const notes = await keptNotes()
  const perNote = await Promise.all(
    notes.map(async (note): Promise<Omit<Keepsake, 'subjects'>[]> => {
      let source: string
      try {
        source = await readNote(note.path)
      } catch {
        return []
      }
      return parseNote({ path: note.path, source }).keepsakes.map((keepsake) => ({
        ...keepsake,
        notePath: note.path,
        noteTitle: note.title,
        dailyDate: note.dailyDate,
        updatedAt: note.updatedAt,
      }))
    }),
  )

  const parsed = perNote.flat()
  const keys = new Set<string>()
  for (const keepsake of parsed) {
    for (const target of keepsake.links) {
      const key = subjectKey(target)
      if (key !== null) {
        keys.add(key)
      }
    }
  }
  const resolved = await resolveSubjectKeys([...keys])

  const days = new Map(notes.map((note) => [note.path, keepsakeDay(note)]))
  const keepsakes = parsed.map((keepsake) => ({
    ...keepsake,
    subjects: subjectsOf(keepsake.links, resolved),
  }))
  return keepsakes.sort((left, right) => {
    const leftDay = days.get(left.notePath) ?? ''
    const rightDay = days.get(right.notePath) ?? ''
    if (leftDay !== rightDay) {
      return leftDay < rightDay ? 1 : -1
    }
    if (left.notePath !== right.notePath) {
      return left.notePath < right.notePath ? 1 : -1
    }
    return left.markerOffset - right.markerOffset
  })
}

/** The calendar day a keepsake is filed under — the Keepsakes view's month grouping. */
export function keepsakeDate(keepsake: Keepsake): string {
  return keepsakeDay(keepsake)
}
