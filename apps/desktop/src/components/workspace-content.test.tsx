import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphInfo } from '@dayjot/core'
import type { ContextSidebarTarget } from '@/components/context-sidebar/sidebar-route'
import { TooltipProvider } from '@/components/ui/tooltip'

interface WorkspaceState {
  sidebarCollapsed: boolean
  contextCollapsed: boolean
  target: ContextSidebarTarget | null
}

const workspaceState = vi.hoisted<WorkspaceState>(() => ({
  sidebarCollapsed: false,
  contextCollapsed: false,
  target: { kind: 'daily', date: '2026-07-11' },
}))

vi.mock('@/components/command-palette/command-palette', () => ({
  CommandPalette: () => null,
}))
vi.mock('@/components/context-sidebar/daily-context-sidebar', () => ({
  DailyContextSidebar: ({ date }: { date: string }) => (
    <div data-testid="daily-context">{date}</div>
  ),
}))
vi.mock('@/components/context-sidebar/note-context-sidebar', () => ({
  NoteContextSidebar: ({ path }: { path: string }) => (
    <div data-testid="note-context">{path}</div>
  ),
}))
vi.mock('@/components/route-content', () => ({ RouteContent: () => <div>Route content</div> }))
vi.mock('@/components/shortcuts-dialog', () => ({ ShortcutsDialog: () => null }))
vi.mock('@/components/sidebar/sidebar', () => ({
  Sidebar: () => <div data-testid="workspace-sidebar" />,
}))
vi.mock('@/components/templates/template-create-dialog', () => ({
  TemplateCreateDialog: () => null,
}))
vi.mock('@/components/templates/template-picker', () => ({ TemplatePicker: () => null }))
vi.mock('@/providers/focused-daily-provider', () => ({
  useDailyContextTarget: () => workspaceState.target,
}))
vi.mock('@/providers/sidebar-provider', () => ({
  useSidebar: () => ({
    sidebarCollapsed: workspaceState.sidebarCollapsed,
    contextCollapsed: workspaceState.contextCollapsed,
    toggleSidebar: vi.fn(),
    toggleContextPanel: vi.fn(),
    toggleFocusMode: vi.fn(),
  }),
}))
// The AppShell asides mount resize handles, which read the persisted widths.
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: { sidebarWidth: 260, contextSidebarWidth: 320 },
    updateSettings: vi.fn(),
    updateSettingsWith: vi.fn(),
  }),
}))
vi.mock('@/routing/app-shortcuts', () => ({ useAppShortcuts: () => ({}) }))

const { WorkspaceContent } = await import('./workspace-content')

const GRAPH: GraphInfo = { root: '/notes', name: 'Notes', generation: 1 }

beforeEach(() => {
  workspaceState.sidebarCollapsed = false
  workspaceState.contextCollapsed = false
  workspaceState.target = { kind: 'daily', date: '2026-07-11' }
})

afterEach(cleanup)

function renderWorkspace() {
  return render(
    <TooltipProvider>
      <WorkspaceContent graph={GRAPH} />
    </TooltipProvider>,
  )
}

describe('WorkspaceContent', () => {
  it('collapses the workspace sidebar on its own, leaving the context panel up', () => {
    const view = renderWorkspace()

    expect(view.getByRole('complementary', { name: 'Workspace' })).toBeTruthy()
    expect(view.getByRole('complementary', { name: 'Context' })).toBeTruthy()
    expect(view.getByTestId('daily-context').textContent).toBe('2026-07-11')
    expect(view.queryByRole('button', { name: 'Expand sidebar' })).toBeNull()

    workspaceState.sidebarCollapsed = true
    view.rerender(
      <TooltipProvider>
        <WorkspaceContent graph={GRAPH} />
      </TooltipProvider>,
    )
    expect(view.queryByRole('complementary', { name: 'Workspace' })).toBeNull()
    expect(view.getByRole('complementary', { name: 'Context' })).toBeTruthy()
    // The reopen affordance floats in the note pane while the sidebar hides.
    expect(view.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()

    workspaceState.sidebarCollapsed = false
    view.rerender(
      <TooltipProvider>
        <WorkspaceContent graph={GRAPH} />
      </TooltipProvider>,
    )
    expect(view.getByRole('complementary', { name: 'Workspace' })).toBeTruthy()
    expect(view.queryByRole('button', { name: 'Expand sidebar' })).toBeNull()
  })

  it('collapses the context panel on its own, leaving the sidebar up', () => {
    workspaceState.target = { kind: 'note', path: 'notes/project.md' }
    const view = renderWorkspace()
    expect(view.getByTestId('note-context').textContent).toBe('notes/project.md')

    workspaceState.contextCollapsed = true
    view.rerender(
      <TooltipProvider>
        <WorkspaceContent graph={GRAPH} />
      </TooltipProvider>,
    )
    expect(view.queryByRole('complementary', { name: 'Context' })).toBeNull()
    expect(view.getByRole('complementary', { name: 'Workspace' })).toBeTruthy()
  })
})
