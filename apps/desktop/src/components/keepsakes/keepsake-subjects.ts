import type { Keepsake } from '@dayjot/core'

/** One subject's keepsakes, newest first. */
export interface KeepsakeSubjectGroup {
  /** The subject's identity (`KeepsakeSubject.key`), or {@link NO_SUBJECT_KEY}. */
  key: string
  /**
   * How the subject reads — the target as it is most often written (`DSA`),
   * ties going to the newest spelling; null for the keepsakes naming none.
   */
  label: string | null
  /** The note the subject resolves to, when there is one to open. */
  notePath: string | null
  keepsakes: Keepsake[]
}

/** The key of the trailing group of keepsakes that link to no subject. */
export const NO_SUBJECT_KEY = ':no-subject'

/**
 * Group `keepsakes` (already newest first) by the subjects their first lines
 * link to — the division a writer who labels keeps (`#keep [[SD]] …`) reads
 * their box by. Subjects are ordered by their most recent keepsake; a keepsake
 * naming two subjects sits under both, and those naming none gather last, so
 * linking stays optional.
 */
export function groupKeepsakesBySubject(keepsakes: readonly Keepsake[]): KeepsakeSubjectGroup[] {
  const groups = new Map<string, KeepsakeSubjectGroup & { spellings: Map<string, number> }>()
  const unlinked: Keepsake[] = []
  for (const keepsake of keepsakes) {
    if (keepsake.subjects.length === 0) {
      unlinked.push(keepsake)
      continue
    }
    for (const subject of keepsake.subjects) {
      let group = groups.get(subject.key)
      if (group === undefined) {
        group = {
          key: subject.key,
          label: subject.target,
          notePath: subject.notePath,
          keepsakes: [],
          spellings: new Map(),
        }
        groups.set(subject.key, group)
      }
      group.keepsakes.push(keepsake)
      group.spellings.set(subject.target, (group.spellings.get(subject.target) ?? 0) + 1)
    }
  }

  const ordered: KeepsakeSubjectGroup[] = [...groups.values()].map(
    ({ spellings, ...group }) => ({ ...group, label: mostWritten(spellings) }),
  )
  if (unlinked.length > 0) {
    ordered.push({ key: NO_SUBJECT_KEY, label: null, notePath: null, keepsakes: unlinked })
  }
  return ordered
}

/** The most frequent spelling; a Map iterates in insertion (newest-first) order, so ties go to the newest. */
function mostWritten(spellings: ReadonlyMap<string, number>): string {
  let best = ''
  let bestCount = 0
  for (const [spelling, count] of spellings) {
    if (count > bestCount) {
      best = spelling
      bestCount = count
    }
  }
  return best
}

/**
 * The Markdown a keepsake shows under `groupKey`: without its leading link when
 * that link *is* the group's subject (the heading already says `SD`), else as
 * written. A keepsake that is nothing but its subject keeps it.
 */
export function keepsakeMarkdownUnder(keepsake: Keepsake, groupKey: string | null): string {
  if (groupKey === null || keepsake.leadLink === null) {
    return keepsake.markdown
  }
  const lead = keepsake.subjects.find((subject) => subject.target === keepsake.leadLink?.trim())
  if (lead?.key !== groupKey || keepsake.markdownAfterLead.trim() === '') {
    return keepsake.markdown
  }
  return keepsake.markdownAfterLead
}
