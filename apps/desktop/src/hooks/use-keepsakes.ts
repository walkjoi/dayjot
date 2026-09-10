import { useQuery } from '@tanstack/react-query'
import { getKeepsakes, hasBridge, type Keepsake } from '@dayjot/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'

/**
 * Every kept line in the graph, newest first — the Keepsakes view's whole read,
 * kept fresh by the usual index invalidation (keep a line, the watcher
 * re-indexes its note, this refetches).
 *
 * `undefined` while the first read is in flight, so the view can tell "still
 * loading" from "nothing kept yet" and never flash its empty state.
 */
export function useKeepsakes(): Keepsake[] | undefined {
  const { graph } = useGraph()
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'keepsakes'],
    queryFn: () => getKeepsakes(),
    enabled: hasBridge() && graph !== null,
  })
  return data
}
