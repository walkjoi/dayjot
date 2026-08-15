import { sql } from 'kysely'
import { db } from './db'

/**
 * Read getters for the Stats page: the weight series (`weight::` inline
 * fields), daily-note dates (the streak substrate), note counts, and per-day
 * word counts. All are projections — private notes included, because Stats is
 * a local-only surface like Tasks.
 */

/** One day's logged weight, reduced to the file's last entry. */
export interface DailyWeight {
  /** The owning daily note's ISO date. */
  date: string
  /** The day's weight in kilograms. */
  kg: number
  /** The owning daily note's path, for click-through navigation. */
  notePath: string
}

/**
 * The weight series, one point per day (a day's *last* `weight::` entry wins),
 * ascending by date. Only daily notes carry date semantics, so weight fields
 * in regular notes are projected but never surface here.
 */
export async function getDailyWeights(): Promise<DailyWeight[]> {
  const rows = await db
    .selectFrom('weights')
    .innerJoin('notes', 'notes.path', 'weights.notePath')
    .where('notes.kind', '=', 'daily')
    .where('notes.dailyDate', 'is not', null)
    .select(['notes.dailyDate', 'weights.kg', 'weights.notePath'])
    .orderBy('notes.dailyDate')
    .orderBy('weights.fieldOffset')
    .execute()
  const byDay = new Map<string, DailyWeight>()
  for (const row of rows) {
    if (row.dailyDate !== null) {
      byDay.set(row.dailyDate, { date: row.dailyDate, kg: row.kg, notePath: row.notePath })
    }
  }
  return [...byDay.values()]
}

/**
 * ISO dates of every indexed daily note, ascending. Daily files are created
 * lazily on first write, so an indexed row means the day has real content —
 * the honest substrate for streaks.
 */
export async function getDailyNoteDates(): Promise<string[]> {
  const rows = await db
    .selectFrom('notes')
    .where('kind', '=', 'daily')
    .where('dailyDate', 'is not', null)
    .select('dailyDate')
    .orderBy('dailyDate')
    .execute()
  return rows.flatMap((row) => (row.dailyDate === null ? [] : [row.dailyDate]))
}

/** How many notes the graph holds (daily and regular; templates excluded). */
export async function getNoteCount(): Promise<number> {
  const row = await db
    .selectFrom('notes')
    .where('kind', '!=', 'template')
    .select(sql<number>`count(*)`.as('count'))
    .executeTakeFirst()
  return row?.count ?? 0
}

/** One day's word count (the daily note's stored CJK-aware projection). */
export interface DailyWordCount {
  date: string
  words: number
}

/** Per-day word counts for daily notes on/after `start` (ISO date), ascending. */
export async function getDailyWordCounts(start: string): Promise<DailyWordCount[]> {
  const rows = await db
    .selectFrom('notes')
    .where('kind', '=', 'daily')
    .where('dailyDate', 'is not', null)
    .where('dailyDate', '>=', start)
    .select(['dailyDate', 'wordCount'])
    .orderBy('dailyDate')
    .execute()
  return rows.flatMap((row) =>
    row.dailyDate === null ? [] : [{ date: row.dailyDate, words: row.wordCount }],
  )
}
