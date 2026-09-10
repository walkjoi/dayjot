import { readNote } from '../graph/commands'
import { KEEP_TAG, parseNote, type ParsedKeepsake } from '../markdown'
import { db } from './db'

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

/** One kept line, with the note context the Keepsakes view renders. */
export interface Keepsake extends ParsedKeepsake {
  notePath: string
  noteTitle: string
  /** ISO date for daily-note keepsakes; null for keepsakes in regular notes. */
  dailyDate: string | null
  /** Note mtime, epoch ms — the recency key for keepsakes outside a daily note. */
  updatedAt: number
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

/**
 * Every kept line across the graph, newest day first and in document order
 * within a note — the Keepsakes view's whole read.
 *
 * A note the index still lists but the disk no longer holds (a deletion racing
 * this read) contributes nothing rather than failing the view.
 */
export async function getKeepsakes(): Promise<Keepsake[]> {
  const notes = await keptNotes()
  const perNote = await Promise.all(
    notes.map(async (note): Promise<Keepsake[]> => {
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

  const days = new Map(notes.map((note) => [note.path, keepsakeDay(note)]))
  return perNote.flat().sort((left, right) => {
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
