import { lazy, Suspense, type ReactElement } from 'react'
import { AllNotesScreen } from '@/components/all-notes/all-notes-screen'
import { DailyView } from '@/components/daily-view'
import { SearchRoute } from '@/components/search-route'
import { SingleNoteView } from '@/components/single-note-view'
import { SettingsNavigator } from '@/components/settings/settings-navigator'
import { SettingsScreen } from '@/components/settings-screen'
import { TasksScreen } from '@/components/tasks/tasks-screen'
import { StatsErrorBoundary } from '@/components/stats/stats-error-boundary'
import { useRouter } from '@/routing/router'
import { ScrollRestored } from '@/routing/scroll-restore'

// Lazy so the charting dependency (recharts) stays out of the startup bundle —
// the editor never pays for a screen most sessions don't open (the Excalidraw
// canvas takes the same shape).
const StatsScreen = lazy(() =>
  import('@/components/stats/stats-screen').then((module) => ({ default: module.StatsScreen })),
)

/**
 * The route → view mapping (Plan 06): the single place a {@link Route} kind
 * becomes a workspace surface. Daily routes render the single-day canvas; a
 * `note` route renders one ordinary note as a first-class editable pane (lazy,
 * so ⌘N's fresh path opens before any file exists). Extracted from the
 * workspace shell so this seam — the contract that non-daily notes are just as
 * editable as daily ones — is directly testable. The daily view owns live
 * today tracking so route arrivals and the highlighted current day use the
 * same clock.
 */
export function RouteContent(): ReactElement {
  const { route } = useRouter()
  switch (route.kind) {
    case 'today':
      return <DailyView target={{ kind: 'today' }} />
    case 'daily':
      // The router normalizes daily routes (see normalizeRoute), so the date
      // is a real calendar day by the time it reaches a view.
      return <DailyView target={{ kind: 'date', date: route.date }} />
    case 'note':
      return <SingleNoteView path={route.path} />
    case 'allNotes':
      // Owns its scroll container (virtualized table + fixed header), so no
      // ScrollRestored wrapper.
      return <AllNotesScreen tag={route.tag} />
    case 'tasks':
      // Owns its scroll container (a grouped list with a fixed header), so no
      // ScrollRestored wrapper — same shape as All Notes.
      return <TasksScreen />
    case 'stats':
      // Owns its scroll container (header + centered column), like Tasks. The
      // boundary keeps a chart crash on this screen instead of white-screening
      // the workspace (there is no root boundary).
      return (
        <StatsErrorBoundary>
          <Suspense fallback={<div className="h-full" />}>
            <StatsScreen />
          </Suspense>
        </StatsErrorBoundary>
      )
    case 'search':
      return <SearchRoute query={route.query} />
    case 'graphs':
    // Graph switching lives in the sidebar footer, so the graph-switcher
    // route renders as settings.
    case 'settings':
      // The section navigator floats in the left gutter — absolutely
      // positioned off the centered column so the column never shifts — and
      // only renders when the container query says the gutter can fit it:
      // the 42rem column plus a 12rem rail either side, with a little slack.
      return (
        <ScrollRestored className="@container h-full overflow-auto px-6 py-8">
          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute inset-y-0 right-full hidden w-48 pr-8 @min-[68rem]:block">
              <SettingsNavigator className="sticky top-8" />
            </div>
            <SettingsScreen />
          </div>
        </ScrollRestored>
      )
  }
}
