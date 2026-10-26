import { useCallback } from 'react'
import type { SlashMenuItem, SlashMenuSearchHandler } from '@meowdown/react'
import { errorMessage, MOOD_SCALE } from '@dayjot/core'
import { rateDailyNote } from '@/lib/note-mood'
import { startOperation } from '@/lib/operations'
import { useGraph } from '@/providers/graph-provider'

/**
 * The editor's `/` menu rows for rating the day — the mood bar's keyboard
 * twin: one row per point on the mood scale, Awful → Great, each setting the
 * daily note's `mood:` frontmatter (nothing is typed into the note; meowdown
 * removes the `/query` text before `onSelect` runs). Offered only on a daily
 * note (`ratedPath`), absent from the empty-query browse list, and shown once
 * the query spells the start of `mood` — from two letters, since five rows on
 * a bare `/m` would crowd every other `m` command.
 */
export function useMoodSlashItems(ratedPath: string | null): SlashMenuSearchHandler {
  const { graph } = useGraph()
  const generation = graph?.generation ?? null

  return useCallback(
    (query: string): SlashMenuItem[] => {
      const typed = query.trim().toLowerCase()
      if (ratedPath === null || generation === null || typed.length < 2 || !'mood'.startsWith(typed)) {
        return []
      }
      return MOOD_SCALE.map((point) => ({
        id: `stats:mood:${point.rating}`,
        label: `Mood: ${point.label}`,
        keywords: ['mood'],
        onSelect: () => {
          rateDailyNote(ratedPath, point.rating, generation).catch((cause: unknown) => {
            startOperation('Saving mood').fail(errorMessage(cause))
          })
        },
      }))
    },
    [ratedPath, generation],
  )
}
