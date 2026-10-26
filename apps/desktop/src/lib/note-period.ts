import { commitNoteFrontmatter } from '@/lib/note-frontmatter'

/**
 * Mark a daily note's day a period day, or unmark it — what the daily bar's
 * period toggle and `/period` write. The flag is frontmatter
 * (`period: true`), so it never shows in the note's text; it lands through
 * the shared frontmatter path (the live session when the note is open, else
 * the file on disk), and a missing daily note is created holding just it.
 */
export function markPeriodDay(
  path: string,
  isPeriodDay: boolean,
  generation: number,
): Promise<void> {
  return commitNoteFrontmatter(path, { period: isPeriodDay }, generation)
}
