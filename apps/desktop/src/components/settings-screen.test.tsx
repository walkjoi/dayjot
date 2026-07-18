import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge, type GraphInfo } from '@dayjot/core'
import { formatFullDate } from '@/lib/dates'
import { resetOperations } from '@/lib/operations'
import { NoteTemplatesProvider } from '@/providers/note-templates-provider'
import { ShortcutsProvider } from '@/providers/shortcuts-provider'
import { SettingsProvider } from '@/providers/settings-provider'
import { UpdateProvider } from '@/providers/update-provider'
import { RouterProvider } from '@/routing/router'
import { ShortcutsDialog } from './shortcuts-dialog'
import { SettingsScreen } from './settings-screen'

// The rebuild-index field reads the open index generation — and the Backup
// section the open graph + sync state — from per-graph providers the screen
// tests don't mount, so stub both hooks (backup disconnected).
const graph = vi.hoisted(() => ({
  current: null as GraphInfo | null,
  indexGeneration: 7 as number | null,
  forget: vi.fn<(root: string) => Promise<void>>(async () => {}),
  deleteGraph: vi.fn<() => Promise<void>>(async () => {}),
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({
    graph: graph.current,
    indexGeneration: graph.indexGeneration,
    forget: graph.forget,
    deleteGraph: graph.deleteGraph,
  }),
}))
vi.mock('@/providers/sync-provider', () => ({
  useSync: () => ({
    backup: { phase: 'disconnected' },
    connectNewRepo: async () => {},
    connectExistingRepo: async () => 'connected',
    disconnectGraph: async () => {},
    signOut: async () => {},
    backUpNow: async () => {},
  }),
}))
// The Import section only hands the picked zip to the workspace-level V1
// import controller, which these screen tests don't mount.
vi.mock('@/providers/v1-import-provider', () => ({
  useV1Import: () => ({
    state: { phase: 'idle' },
    startImport: () => {},
    cancelImport: () => {},
    dismiss: () => {},
  }),
}))

// jsdom doesn't implement this; Radix Select scrolls the selected option into
// view when the listbox opens.
Element.prototype.scrollIntoView ??= () => {}

let stored: Record<string, unknown>
let saved: unknown[]
let invoked: string[]

function installFakeBridge(): void {
  saved = []
  invoked = []
  setBridge({
    invoke: async (command, args) => {
      invoked.push(command)
      switch (command) {
        case 'settings_load':
          return stored
        case 'settings_save':
          saved.push(args['settings'])
          return null
        case 'embed_status':
        case 'embed_ensure':
          return { status: 'uninitialized' }
        case 'list_files':
          return []
        case 'db_query':
          return [] // the Note templates section lists `kind = 'template'` rows
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
}

let queryClient: QueryClient

function renderScreen(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <UpdateProvider autoCheck={false}>
          {/* The Note templates section opens files (router) and shares the
              "New template" dialog state (templates provider). */}
          <RouterProvider>
            <ShortcutsProvider>
              <NoteTemplatesProvider>
                <SettingsScreen />
                <ShortcutsDialog />
              </NoteTemplatesProvider>
            </ShortcutsProvider>
          </RouterProvider>
        </UpdateProvider>
      </SettingsProvider>
    </QueryClientProvider>,
  )
}

function radio(name: RegExp): HTMLInputElement {
  const element = screen.getByRole('radio', { name })
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('expected an <input type="radio">')
  }
  return element
}

beforeEach(() => {
  stored = {}
  graph.current = null
  graph.indexGeneration = 7
  graph.forget.mockClear()
  graph.deleteGraph.mockClear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  installFakeBridge()
})

afterEach(() => {
  cleanup() // `globals: false` disables testing-library's automatic cleanup
  vi.useRealTimers()
  setBridge(null)
  queryClient.clear()
})

describe('SettingsScreen', () => {
  it('shows update controls when the native bridge is available', () => {
    renderScreen()
    expect(screen.getByRole('button', { name: /check for updates/i })).toBeTruthy()
  })



  it('confirms before forgetting the open graph from saved graphs', async () => {
    graph.current = { root: '/graphs/work', name: 'Work', generation: 1 }
    renderScreen()

    const section = screen.getByRole('region', { name: 'Danger zone' })
    fireEvent.click(within(section).getByRole('button', { name: /forget graph/i }))

    const dialog = screen.getByRole('dialog', { name: /forget graph/i })
    expect(within(dialog).getByText('/graphs/work')).toBeTruthy()
    expect(graph.forget).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: /forget graph/i }))

    await waitFor(() => expect(graph.forget).toHaveBeenCalledWith('/graphs/work'))
  })

  it('requires typing the graph name before deleting the graph', async () => {
    graph.current = { root: '/graphs/work', name: 'Work', generation: 1 }
    renderScreen()

    const section = screen.getByRole('region', { name: 'Danger zone' })
    fireEvent.click(within(section).getByRole('button', { name: /delete graph/i }))

    const dialog = screen.getByRole('dialog', { name: /delete graph/i })
    expect(within(dialog).getByText('/graphs/work')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: /delete graph/i })
    expect(confirm.hasAttribute('disabled')).toBe(true)

    const nameInput = within(dialog).getByLabelText('Graph name')
    fireEvent.change(nameInput, { target: { value: 'Wor' } })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    // Enter with a mismatched name must not delete either.
    fireEvent.keyDown(nameInput, { key: 'Enter' })
    expect(graph.deleteGraph).not.toHaveBeenCalled()

    fireEvent.change(nameInput, { target: { value: 'Work' } })
    expect(confirm.hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => expect(graph.deleteGraph).toHaveBeenCalledTimes(1))
  })

  it('reflects the persisted markdown syntax mode', async () => {
    stored = { editorMarkdownSyntax: 'show' }
    renderScreen()
    await waitFor(() => expect(radio(/^show/i).checked).toBe(true))
    expect(radio(/^hide/i).checked).toBe(false)
  })

  it('selecting Show applies instantly and persists', async () => {
    renderScreen()
    await waitFor(() => expect(radio(/^hide/i).checked).toBe(true))

    fireEvent.click(radio(/^show/i))

    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'show',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
    expect(radio(/^show/i).checked).toBe(true)
    expect(radio(/^hide/i).checked).toBe(false)
  })

  it('reflects the persisted text size', async () => {
    stored = { editorTextSize: 'large' }
    renderScreen()
    await waitFor(() => expect(radio(/^large/i).checked).toBe(true))
    expect(radio(/^medium/i).checked).toBe(false)
  })

  it('selecting Large applies instantly and persists the text size', async () => {
    renderScreen()
    await waitFor(() => expect(radio(/^small/i).checked).toBe(true))

    fireEvent.click(radio(/^large/i))

    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'large',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
    expect(radio(/^large/i).checked).toBe(true)
    expect(radio(/^medium/i).checked).toBe(false)
  })

  it('enables full-width notes instantly and persists the preference', async () => {
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /full-width notes/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(saved.at(-1)).toMatchObject({ editorFullWidth: true }))
  })

  it('reflects a persisted spell check opt-out', async () => {
    stored = { editorSpellCheck: false }
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /spell check/i })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })

  it('toggling spell check off applies instantly and persists', async () => {
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /spell check/i })
    // On by default.
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: false,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('reflects a persisted smooth caret animation opt-out', async () => {
    stored = { editorSmoothCaretAnimation: false }
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /smooth caret animation/i })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })

  it('disables smooth caret animation instantly and persists the preference', async () => {
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /smooth caret animation/i })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await waitFor(() =>
      expect(saved.at(-1)).toMatchObject({ editorSmoothCaretAnimation: false }),
    )
  })

  it('reflects a persisted default-bullet opt-out', async () => {
    stored = { editorDefaultBullet: false }
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /start with a bullet/i })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })

  it('toggling the default bullet off applies instantly and persists', async () => {
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /start with a bullet/i })
    // On by default.
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: false,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('reflects a persisted bullet-after-heading opt-out', async () => {
    stored = { editorBulletAfterHeading: false }
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /bullet after a heading/i })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })

  it('toggling bullet-after-heading off persists independently of the seed bullet', async () => {
    renderScreen()
    const toggle = screen.getByRole('switch', { name: /bullet after a heading/i })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: false,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('reflects the persisted theme and persists a new choice', async () => {
    stored = { theme: 'dark' }
    renderScreen()
    await waitFor(() => expect(radio(/^dark/i).checked).toBe(true))

    fireEvent.click(radio(/^light/i))

    expect(radio(/^light/i).checked).toBe(true)
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'light',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('reflects the persisted date format', async () => {
    stored = { dateFormat: 'dmy' }
    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Date format' })
    // The options label themselves with today's date in each order.
    await waitFor(() => expect(trigger.textContent).toContain(formatFullDate(new Date(), 'dmy')))
  })

  it('selecting day-month-year persists the date format', async () => {
    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Date format' })
    await waitFor(() => expect(trigger.textContent).toContain(formatFullDate(new Date(), 'mdy')))

    // Keyboard-driven (the pointer path needs capture APIs jsdom lacks).
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(
      await screen.findByRole('option', { name: formatFullDate(new Date(), 'dmy') }),
      { key: 'Enter' },
    )

    expect(trigger.textContent).toContain(formatFullDate(new Date(), 'dmy'))
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'dmy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('selecting ISO persists the date format', async () => {
    const now = new Date(2026, 5, 10, 12, 0, 0)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(now)

    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Date format' })
    const isoLabel = formatFullDate(now, 'iso')
    await waitFor(() => expect(trigger.textContent).toContain(formatFullDate(now, 'mdy')))

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(await screen.findByRole('option', { name: isoLabel }), { key: 'Enter' })

    expect(trigger.textContent).toContain(isoLabel)
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'iso',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('shows the week start setting in Date & time', async () => {
    renderScreen()
    const dateTime = screen.getByRole('region', { name: 'Date & time' })
    const appearance = screen.getByRole('region', { name: 'Appearance' })

    await waitFor(() =>
      expect(within(dateTime).getByRole('combobox', { name: 'Start week on' })).toBeTruthy(),
    )
    expect(within(appearance).queryByRole('combobox', { name: 'Start week on' })).toBeNull()
  })

  it('selecting Sunday persists the week start day', async () => {
    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Start week on' })
    await waitFor(() => expect(trigger.textContent).toContain('Monday'))

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Sunday' }), { key: 'Enter' })

    expect(trigger.textContent).toContain('Sunday')
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'sunday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('reflects the persisted time format', async () => {
    stored = { timeFormat: '24h' }
    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Time format' })
    await waitFor(() => expect(trigger.textContent).toContain('24-hour'))
  })

  it('selecting 24-hour persists the time format', async () => {
    renderScreen()
    const trigger = screen.getByRole('combobox', { name: 'Time format' })
    await waitFor(() => expect(trigger.textContent).toContain('12-hour'))

    // Keyboard-driven (the pointer path needs capture APIs jsdom lacks).
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(await screen.findByRole('option', { name: '24-hour' }), { key: 'Enter' })

    expect(trigger.textContent).toContain('24-hour')
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '24h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('adds an All Notes filter tag, normalized, and persists it', async () => {
    renderScreen()
    const input = screen.getByLabelText('Add filter tag')

    fireEvent.change(input, { target: { value: ' #Meeting ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('#meeting')).toBeTruthy()
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['book', 'link', 'person', 'meeting'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('rejects a tag name outside the #tag grammar with an inline error', async () => {
    renderScreen()
    const input = screen.getByLabelText('Add filter tag')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('expected an <input>')
    }

    fireEvent.change(input, { target: { value: 'my tag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert').textContent).toContain(`"my tag" can't be a tag`)
    // The draft stays put for fixing, and nothing reaches the store.
    expect(input.value).toBe('my tag')
    await waitFor(() => expect(saved).toEqual([]))
  })

  it('ignores adding a duplicate filter tag', async () => {
    stored = { allNotesFilterTags: ['book'] }
    renderScreen()
    // Defaults render before the disk document lands — wait for hydration
    // (the stored list has no `person`) so the click edits the loaded list.
    await waitFor(() => expect(screen.queryByText('#person')).toBeNull())
    expect(screen.getByText('#book')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Add filter tag'), { target: { value: 'BOOK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(saved).toEqual([]))
  })

  it('removes a filter tag and persists the rest', async () => {
    stored = { allNotesFilterTags: ['book', 'person'] }
    renderScreen()
    // Wait for hydration (the stored list has no `link`), not just defaults.
    await waitFor(() => expect(screen.queryByText('#link')).toBeNull())
    expect(screen.getByText('#book')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove book' }))

    expect(screen.queryByText('#book')).toBeNull()
    await waitFor(() =>
      expect(saved).toEqual([
        {
          editorMarkdownSyntax: 'hide',
          editorSpellCheck: true,
          editorDefaultBullet: true,
          editorBulletAfterHeading: true,
          editorSmoothCaretAnimation: true,
          editorTextSize: 'small',
          editorFullWidth: false,
          sidebarWidth: 260,
          contextSidebarWidth: 320,
          timestampFormat: '- HH:mm ',
          timestampKeybinding: 'Mod-Shift-t',
          contactsEnabled: false,
          mobileOnboarded: false,
          mobileStorage: 'local',
          mobileGraphName: '',
          theme: 'system',
          timeFormat: '12h',
          dateFormat: 'mdy',
          weekStartDay: 'monday',
          allNotesFilterTags: ['person'],
          calendarEnabled: false,
          calendarIds: [],
          graphColors: {},
        },
      ]),
    )
  })

  it('rebuilding the index wipes and re-applies the projection through the bridge', async () => {
    try {
      renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /rebuild index/i }))

      // The whole chain: button → rebuildIndexVisibly → wipe, then the
      // projection-version stamp that marks a completed rebuild. (The graph is
      // empty here, so there is no apply batch in between.)
      await waitFor(() => expect(invoked).toContain('index_clear'))
      await waitFor(() => expect(invoked).toContain('index_meta_set'))
    } finally {
      resetOperations()
    }
  })

  it('disables the index rebuild until a graph index is open', () => {
    graph.indexGeneration = null
    renderScreen()
    const button = screen.getByRole('button', { name: /rebuild index/i })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('opens the global shortcuts dialog from the editor settings row', async () => {
    renderScreen()
    const section = screen.getByRole('region', { name: 'Editor' })

    fireEvent.click(within(section).getByRole('button', { name: /show all/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    // App scope (command titles) and editor scope (binding descriptions) still
    // come from the global cheat-sheet, not from a duplicated settings list.
    expect(within(dialog).getByText('Toggle sidebar')).toBeTruthy()
    expect(within(dialog).getByText('Go to today')).toBeTruthy()
    expect(within(dialog).getByText('Bold')).toBeTruthy()
    expect(within(dialog).getByText('Heading 1')).toBeTruthy()
    expect(within(dialog).getByText('Open the AI menu on the selection')).toBeTruthy()
  })

})
