import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphInfo } from '@dayjot/core'
import type { ContextSidebarTarget } from '@/components/context-sidebar/sidebar-route'
import { TooltipProvider } from '@/components/ui/tooltip'

interface WorkspaceState {
  sidebarCollapsed: boolean
  contextCollapsed: boolean
  target: ContextSidebarTarget | null
  /** What `useNoteRow` returns — a gistUrl is what keeps a note's panel alive. */
  noteRow: { gistUrl: string | null } | null
  /** What `useDayEvents` returns — a day's meetings keep its panel alive. */
  events: unknown[]
}

const workspaceState = vi.hoisted<WorkspaceState>(() => ({
  sidebarCollapsed: false,
  contextCollapsed: false,
  target: { kind: 'daily', date: '2026-07-11' },
  // Default to a published note so the panel is present for the collapse tests;
  // the hide-when-empty tests clear this.
  noteRow: { gistUrl: 'https://gist.github.com/alex/x' },
  events: [],
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
vi.mock('@/hooks/use-note-row', () => ({ useNoteRow: () => workspaceState.noteRow }))
vi.mock('@/lib/use-calendar', () => ({ useDayEvents: () => workspaceState.events }))
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
  workspaceState.noteRow = { gistUrl: 'https://gist.github.com/alex/x' }
  workspaceState.events = []
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
    expect(view.container.querySelector('.pt-7')).toBeNull()

    workspaceState.sidebarCollapsed = true
    view.rerender(
      <TooltipProvider>
        <WorkspaceContent graph={GRAPH} />
      </TooltipProvider>,
    )
    expect(view.queryByRole('complementary', { name: 'Workspace' })).toBeNull()
    expect(view.getByRole('complementary', { name: 'Context' })).toBeTruthy()
    // The reopen affordance floats in the note pane while the sidebar hides,
    // and the pane reserves the title-bar band so route headers (Tasks'
    // search row) don't slide under the window chrome next to it.
    expect(view.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
    expect(view.container.querySelector('.pt-7')).not.toBeNull()

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

  it('omits the context panel for an ordinary day with no meetings or share link', () => {
    // The calendar lives in the left sidebar now, so a bare day has nothing to
    // put in the right rail — it stays a clean single column.
    workspaceState.target = { kind: 'daily', date: '2026-07-11' }
    workspaceState.noteRow = null
    workspaceState.events = []
    const view = renderWorkspace()

    expect(view.queryByRole('complementary', { name: 'Context' })).toBeNull()
    expect(view.queryByTestId('daily-context')).toBeNull()
    expect(view.getByRole('complementary', { name: 'Workspace' })).toBeTruthy()
  })

  it('shows the daily context panel when the day has meetings', () => {
    workspaceState.target = { kind: 'daily', date: '2026-07-11' }
    workspaceState.noteRow = null
    workspaceState.events = [{ id: 'e1' }]
    const view = renderWorkspace()

    expect(view.getByRole('complementary', { name: 'Context' })).toBeTruthy()
    expect(view.getByTestId('daily-context').textContent).toBe('2026-07-11')
  })

  it('omits an unpublished note’s context panel', () => {
    workspaceState.target = { kind: 'note', path: 'notes/project.md' }
    workspaceState.noteRow = null
    const view = renderWorkspace()

    expect(view.queryByRole('complementary', { name: 'Context' })).toBeNull()
    expect(view.queryByTestId('note-context')).toBeNull()
  })
})
