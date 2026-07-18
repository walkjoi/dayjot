import type { ReactElement } from 'react'
import type { GraphInfo } from '@dayjot/core'
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
import { cn } from '@/lib/utils'
import { useDailyContextTarget } from '@/providers/focused-daily-provider'
import { useSidebar } from '@/providers/sidebar-provider'
import { useAppShortcuts } from '@/routing/app-shortcuts'

interface WorkspaceContentProps {
  graph: GraphInfo
}

/** The context panel for the route's sidebar target, if it gets one. */
function contextSidebarFor(target: ContextSidebarTarget | null): ReactElement | undefined {
  if (target === null) {
    return undefined
  }
  return target.kind === 'daily' ? (
    <DailyContextSidebar date={target.date} />
  ) : (
    <NoteContextSidebar path={target.path} />
  )
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
  // Daily routes get the day's contextual panel and note routes the note's;
  // search/settings get none (AppShell omits the region when context is absent).
  // The daily canvas reports the day it shows (the `today` route pins its
  // date at arrival), so the panel follows the shown day, not the clock.
  const contextTarget = useDailyContextTarget()

  return (
    <AppShell
      sidebar={
        sidebarCollapsed ? undefined : <Sidebar graph={graph} context={commandContext} />
      }
      sidebarEdge={<SidebarResizeHandle panel="workspace" />}
      context={contextCollapsed ? undefined : contextSidebarFor(contextTarget)}
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
