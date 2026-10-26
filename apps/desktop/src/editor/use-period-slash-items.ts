import { useCallback } from 'react'
import type { SlashMenuItem, SlashMenuSearchHandler } from '@meowdown/react'
import { errorMessage, parseFrontmatter, splitFrontmatter } from '@dayjot/core'
import { readNoteSource } from '@/lib/note-frontmatter'
import { markPeriodDay } from '@/lib/note-period'
import { startOperation } from '@/lib/operations'
import { useGraph } from '@/providers/graph-provider'

/**
 * The editor's `/` menu row for the period-day flag — the daily bar's toggle
 * as a keyboard twin. It reads the note's live frontmatter, so it offers
 * whichever flip applies ("Mark period day" / "Unmark period day"), and
 * selecting it sets or clears `period:` (nothing is typed into the note).
 * Offered only on a daily note (`loggedDayPath`), absent from the empty-query
 * browse list, and shown once the query spells the start of `period`.
 */
export function usePeriodSlashItems(loggedDayPath: string | null): SlashMenuSearchHandler {
  const { graph } = useGraph()
  const generation = graph?.generation ?? null

  return useCallback(
    async (query: string): Promise<SlashMenuItem[]> => {
      const typed = query.trim().toLowerCase()
      if (loggedDayPath === null || generation === null || typed === '' || !'period'.startsWith(typed)) {
        return []
      }
      const source = await readNoteSource(loggedDayPath)
      const isPeriodDay = parseFrontmatter(splitFrontmatter(source).raw).data.period
      return [
        {
          id: 'stats:period',
          label: isPeriodDay ? 'Unmark period day' : 'Mark period day',
          keywords: ['period'],
          onSelect: () => {
            markPeriodDay(loggedDayPath, !isPeriodDay, generation).catch((cause: unknown) => {
              startOperation('Saving period day').fail(errorMessage(cause))
            })
          },
        },
      ]
    },
    [loggedDayPath, generation],
  )
}
