import { commitNoteFrontmatter } from '@/lib/note-frontmatter'

/**
 * Set a daily note's mood rating (1–5), or clear it with `null` — what the
 * daily mood bar and `/mood` write. The rating is frontmatter (`mood: 4`), so
 * it never shows in the note's text; it lands through the shared frontmatter
 * path (the live session when the note is open, else the file on disk), and a
 * missing daily note is created holding just the rating.
 */
export function rateDailyNote(
  path: string,
  rating: number | null,
  generation: number,
): Promise<void> {
  return commitNoteFrontmatter(path, { mood: rating }, generation)
}
