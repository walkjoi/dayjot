import { useQuery } from '@tanstack/react-query'
import {
  getDailyNoteDates,
  getDailyWeights,
  getDailyWordCounts,
  getNoteCount,
  hasBridge,
  type DailyWeight,
  type DailyWordCount,
} from '@dayjot/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'

/**
 * Index-backed reads for the Stats page, kept fresh by the usual index
 * invalidation: edit a note, the watcher re-indexes it, these refetch. Each
 * hook is one query key under the index scope, mirroring `usePinnedNotes`.
 */

function useIndexQuery<Value>(
  name: string,
  queryFn: () => Promise<Value>,
  extraKey: string | null = null,
): Value | undefined {
  const { graph } = useGraph()
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, name, extraKey],
    queryFn,
    enabled: hasBridge() && graph !== null,
  })
  return data
}

/** The per-day weight series (last `weight::` entry per day), ascending. */
export function useDailyWeights(): DailyWeight[] {
  return useIndexQuery('daily-weights', () => getDailyWeights()) ?? []
}

/** ISO dates of every indexed daily note, ascending — the streak substrate. */
export function useDailyNoteDates(): string[] {
  return useIndexQuery('daily-note-dates', () => getDailyNoteDates()) ?? []
}

/** How many notes the graph holds (templates excluded). */
export function useNoteCount(): number {
  return useIndexQuery('note-count', () => getNoteCount()) ?? 0
}

/** Per-day word counts for daily notes on/after `start`, ascending. */
export function useDailyWordCounts(start: string): DailyWordCount[] {
  return useIndexQuery('daily-word-counts', () => getDailyWordCounts(start), start) ?? []
}
