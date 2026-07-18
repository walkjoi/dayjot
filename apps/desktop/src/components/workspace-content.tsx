import type { ReactElement } from 'react'
import { dailyPath, type GraphInfo } from '@dayjot/core'
import { AppShell } from '@/components/app-shell'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { DailyContextSidebar } from '@/components/context-sidebar/daily-context-sidebar'
import { NoteContextSidebar } from '@/components/context-sidebar/note-context-sidebar'
import { type ContextSidebarTarget } from '@/components/context-sidebar/sidebar-route'
import { RouteContent } from '@/components/route-content'
import { ShortcutsDialog } from '@/components/shortcuts-dialog'
import { Sidebar } from '@/components/sidebar/sidebar'
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import { TemplateCreateDialog } from '@/components/templates/template-create-dialog'
import { TemplatePicker } from '@/components/templates/template-picker'
import { useNoteRow } from '@/hooks/use-note-row'
import { useDayEvents } from '@/lib/use-calendar'
import { cn } from '@/lib/utils'
import { useDailyContextTarget } from '@/providers/focused-daily-provider'
import { useSidebar } from '@/providers/sidebar-provider'
import { useAppShortcuts } from '@/routing/app-shortcuts'

interface WorkspaceContentProps {
  graph: GraphInfo
}

// A valid ISO date to satisfy the always-on `useDayEvents` hook when there is
// no daily target; the calendar integration is off by default, so this never
// queries, and its result is ignored unless the target is actually daily.
const NO_DAY = '2000-01-01'

/**
 * The right context panel for the route's target, or `undefined` when it would
 * be empty. With the day-navigation calendar moved to the left sidebar, this
 * panel only carries optional extras — a day's meetings, a note's share link —
 * both of which most notes lack, so hiding the empty panel keeps the reading
 * canvas a clean single column instead of a bare sunken rail.
 */
function useContextPanel(target: ContextSidebarTarget | null): ReactElement | undefined {
  const dailyDate = target?.kind === 'daily' ? target.date : null
  const notePath =
    target?.kind === 'note' ? target.path : dailyDate !== null ? dailyPath(dailyDate) : ''
  const row = useNoteRow(notePath)
  const events = useDayEvents(dailyDate ?? NO_DAY)
  const hasPublishedUrl = (row?.gistUrl ?? null) !== null
  const hasEvents = dailyDate !== null && events.length > 0

  if (target === null) {
    return undefined
  }
  if (target.kind === 'daily') {
    return hasEvents || hasPublishedUrl ? <DailyContextSidebar date={target.date} /> : undefined
  }
  return hasPublishedUrl ? <NoteContextSidebar path={target.path} /> : undefined
}

/**
 * Everything inside the workspace's providers: the headerless shell — the
 * collapsible workspace and contextual sidebars beside the note pane — plus
 * the always-mounted global surfaces (operations status, ⌘K palette). Split
 * from {@link GraphWorkspace} because these hooks need the providers it
 * mounts.
 */
export function WorkspaceContent({ graph }: WorkspaceContentProps): ReactElement {
  const { sidebarCollapsed, contextCollapsed } = useSidebar()
  const commandContext = useAppShortcuts()
  // The daily canvas reports the day it shows (the `today` route pins its
  // date at arrival), so the panel follows the shown day, not the clock.
  // The panel appears only when it has content (a day's meetings or a share
  // link); search/settings and an ordinary day get none.
  const contextTarget = useDailyContextTarget()
  const contextPanel = useContextPanel(contextTarget)

  return (
    <AppShell
      sidebar={
        sidebarCollapsed ? undefined : <Sidebar graph={graph} context={commandContext} />
      }
      sidebarEdge={<SidebarResizeHandle panel="workspace" />}
      context={contextCollapsed ? undefined : contextPanel}
      contextEdge={<SidebarResizeHandle panel="context" />}
    >
      {/* With the sidebar collapsed, the note pane becomes the window's
          leftmost surface: the macOS traffic lights, the drag strip, and the
          floating expand button all land on its top edge. Reserve that band
          (`pt-7`, the strip's height) so route headers — All Notes' search
          row especially — never slide under the window chrome. */}
      <div
        className={cn('relative flex h-full flex-col', sidebarCollapsed && 'pt-7')}
      >
        {sidebarCollapsed ? <SidebarToggle /> : null}
        <div className="min-h-0 flex-1">
          <RouteContent />
        </div>

        <CommandPalette context={commandContext} />
        <ShortcutsDialog />
        <TemplatePicker context={commandContext} />
        <TemplateCreateDialog context={commandContext} />
      </div>
    </AppShell>
  )
}
