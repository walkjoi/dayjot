import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react'
import type { Keepsake } from '@dayjot/core'
import { useKeepsakes } from '@/hooks/use-keepsakes'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation'
import { useWikiLinkNavigation } from '@/editor/use-wiki-link-navigation'
import { useGraph } from '@/providers/graph-provider'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { routeForPath } from '@/routing/route'
import { ScrollRestored } from '@/routing/scroll-restore'
import { KeepsakeRow } from './keepsake-row'
import { groupKeepsakesByMonth } from './keepsake-months'

/**
 * The Keepsakes view — the box.
 *
 * Every line kept with `⌘⇧B`, newest first, set at reading size in the note
 * font. It is a page to read down, not a list to work through, so it carries
 * no counts in the sidebar, no filters, no sort controls, and nothing to clear:
 * a keepsake is never *done*, and a number beside it would read as a debt.
 * Months are the only division, and they come from dates the fragments already
 * carry.
 *
 * There is no table behind this. The read finds the few notes carrying `#keep`
 * through the existing tags index and parses those on demand.
 */
export function KeepsakesScreen(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const { graph } = useGraph()
  const keepsakes = useKeepsakes()
  const navigateNoteLink = useNoteLinkNavigation()
  const navigateWikiLink = useWikiLinkNavigation(graph?.generation ?? null)

  const months = useMemo(() => groupKeepsakesByMonth(keepsakes ?? []), [keepsakes])

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  const openSource = useCallback(
    (keepsake: Keepsake, event: NewWindowClickEvent) => {
      navigateNoteLink(routeForPath(keepsake.notePath), event)
    },
    [navigateNoteLink],
  )

  const openLink = useCallback(
    (target: string, event: NewWindowClickEvent) => {
      navigateWikiLink(target, event as unknown as MouseEvent)
    },
    [navigateWikiLink],
  )

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      aria-label="Keepsakes"
      className="flex h-full min-h-0 flex-col outline-none"
    >
      <header className="flex flex-none items-center border-b border-border py-2.5 pl-4 pr-3 lg:pl-10">
        <div className="window-drag-control min-w-0 flex-1">
          <h1 className="py-1.5 text-sm font-medium text-text">Keepsakes</h1>
        </div>
      </header>

      <ScrollRestored className="min-h-0 flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {keepsakes === undefined ? null : keepsakes.length === 0 ? (
            <KeepsakesEmpty />
          ) : (
            months.map((month) => (
              <section key={month.key} className="mb-8 last:mb-0">
                <h2 className="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">
                  {month.label}
                </h2>
                <ul className="list-none p-0">
                  {month.keepsakes.map((keepsake) => (
                    <KeepsakeRow
                      key={`${keepsake.notePath}:${keepsake.markerOffset}`}
                      keepsake={keepsake}
                      onOpenSource={openSource}
                      onOpenLink={openLink}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </ScrollRestored>
    </div>
  )
}

/**
 * The empty box says what it is for, once, and then says nothing ever again —
 * no prompts, no progress, no suggestion that something is missing.
 */
function KeepsakesEmpty(): ReactElement {
  return (
    <p className="max-w-[46ch] text-sm leading-relaxed text-text-muted">
      Nothing kept yet. When a line in a note is worth more than the day it was
      written on, press <span className="font-medium text-text-secondary">⌘⇧B</span> on it — it
      will be here whenever you want to look.
    </p>
  )
}
