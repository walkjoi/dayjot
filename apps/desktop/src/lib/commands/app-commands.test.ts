import { describe, expect, it, vi } from 'vitest'
import type { NoteRow, PinnedNote } from '@dayjot/core'
import { addDaysIso, todayIso } from '@/lib/dates'
import { notePathForRoute, type Route } from '@/routing/route'
import type { NavigateOptions } from '@/routing/router'
import { resetOperations } from '@/lib/operations'
import type { CommandContext } from './types'
import {
  resetKeybindingOverridesForTests,
  setCommandKeybindingOverride,
} from './keybinding-overrides'

const TODAY = '2026-06-09'

const randomNotePath = vi.hoisted(() => vi.fn())
const rebuildIndex = vi.hoisted(() => vi.fn())
const toggleNotePinned = vi.hoisted(() => vi.fn(async () => true))
const toggleNotePrivate = vi.hoisted(() => vi.fn(async () => true))
const runCopyDeepLink = vi.hoisted(() => vi.fn(async () => undefined))
const getNote = vi.hoisted(() => vi.fn<() => Promise<NoteRow | undefined>>(async () => undefined))
const getPinnedNotes = vi.hoisted(() => vi.fn<() => Promise<PinnedNote[]>>(async () => []))
const hasBridge = vi.hoisted(() => vi.fn(() => true))
const toggleDevtools = vi.hoisted(() => vi.fn(async () => undefined))
const openRouteInNewWindow = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
const operationFail = vi.hoisted(() => vi.fn())
const startOperation = vi.hoisted(() =>
  vi.fn(() => ({ progress: vi.fn(), done: vi.fn(), fail: operationFail })),
)
vi.mock('@/lib/note-pin', () => ({ toggleNotePinned }))
vi.mock('@/lib/note-private', () => ({ toggleNotePrivate }))
vi.mock('@/lib/note-deep-link', () => ({ runCopyDeepLink }))
vi.mock('@/lib/windows/open-in-new-window', () => ({ openRouteInNewWindow }))
vi.mock('@/lib/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/operations')>()),
  startOperation,
}))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  randomNotePath,
  rebuildIndex,
  getNote,
  getPinnedNotes,
  hasBridge,
  toggleDevtools,
}))

// Importing registers the commands (module side effect, like production).
const { APP_COMMANDS, keybindingFor } = await import('./app-commands')

function command(id: string) {
  const found = APP_COMMANDS.find((entry) => entry.id === id)
  if (!found) {
    throw new Error(`no such command: ${id}`)
  }
  return found
}

function fakeContext(overrides?: Partial<CommandContext>) {
  const navigated: Route[] = []
  const navigateOptions: (NavigateOptions | undefined)[] = []
  const route: () => Route = overrides?.route ?? (() => ({ kind: 'today' }))
  const context: CommandContext = {
    navigate: (target, options) => {
      navigated.push(target)
      navigateOptions.push(options)
    },
    route,
    // Mirror the real context: note-scoped commands resolve their target from
    // the route (the focused-day branch is exercised in app-shortcuts).
    notePath: () => notePathForRoute(route(), TODAY),
    back: vi.fn(),
    forward: vi.fn(),
    clearScrollState: vi.fn(),
    toggleTheme: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleContextPanel: vi.fn(),
    toggleFocusMode: vi.fn(),
    switchGraph: vi.fn(),
    timestampFormat: () => '- HH:mm ',
    generation: () => 7,
    openPalette: vi.fn(),
    openShortcuts: vi.fn(),
    openTemplatePicker: vi.fn(),
    openTemplateCreate: vi.fn(),
    ...overrides,
  }
  return { context, navigated, navigateOptions }
}

function noteRow(isPrivate: boolean): NoteRow {
  return {
    path: 'notes/a.md',
    title: 'A',
    dailyDate: null,
    isPrivate,
    hasConflict: false,
    gistUrl: null,
    gistStale: false,
  }
}

describe('keybindingFor', () => {
  it('returns the binding UI hints derive from', () => {
    expect(keybindingFor('nav.today')).toBe('Mod-d')
    expect(keybindingFor('nav.allNotes')).toBe('Mod-Shift-a')
    expect(keybindingFor('palette.open')).toBe('Mod-k')
  })

  it('returns null for unbound commands and unknown ids', () => {
    expect(keybindingFor('theme.toggle')).toBeNull() // a real command, no binding
    expect(keybindingFor('no.such.command')).toBeNull()
  })


  it('dev.toggleDevtools is bound to Mod-Shift-i', () => {
    expect(keybindingFor('dev.toggleDevtools')).toBe('Mod-Shift-i')
  })

  it('note.copyDeepLink keeps the V1 copy-link shortcut', () => {
    expect(keybindingFor('note.copyDeepLink')).toBe('Alt-Mod-l')
  })

  it('note.openInNewWindow uses the system-level open-window shortcut', () => {
    expect(keybindingFor('note.openInNewWindow')).toBe('Mod-Shift-o')
  })

  it('graph switch commands use macOS command-number bindings', () => {
    expect(keybindingFor('graph.switch1')).toBe('Meta-1')
    expect(keybindingFor('graph.switch9')).toBe('Meta-9')
  })
})

describe('app commands', () => {

  it('settings.open navigates to the settings screen', async () => {
    const { context, navigated } = fakeContext()
    await command('settings.open').run(context)
    expect(navigated).toEqual([{ kind: 'settings' }])
  })

  it('shortcuts.show opens the ⌘/ cheat-sheet through the context capability', async () => {
    const { context } = fakeContext()
    await command('shortcuts.show').run(context)
    expect(context.openShortcuts).toHaveBeenCalledTimes(1)
    expect(keybindingFor('shortcuts.show')).toBe('Mod-/')
  })

  it('template.insert opens the picker only where a note is being edited', async () => {
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await command('template.insert').run(context)
    expect(context.openTemplatePicker).toHaveBeenCalledTimes(1)

    // Settings edits no note — there is nothing to insert into.
    const { context: noNote } = fakeContext({ route: () => ({ kind: 'settings' }) })
    await command('template.insert').run(noNote)
    expect(noNote.openTemplatePicker).not.toHaveBeenCalled()
  })

  it('template.new opens the name dialog through the context capability', async () => {
    const { context } = fakeContext()
    await command('template.new').run(context)
    expect(context.openTemplateCreate).toHaveBeenCalledTimes(1)
  })


  it('graph switch commands select their recent graph position', async () => {
    const switchGraph = vi.fn()
    const { context } = fakeContext({ switchGraph })

    await command('graph.switch1').run(context)
    await command('graph.switch9').run(context)

    expect(switchGraph).toHaveBeenNthCalledWith(1, 0)
    expect(switchGraph).toHaveBeenNthCalledWith(2, 8)
  })

  it('note.new clears daily scroll and navigates to a fresh lazy ULID note path', async () => {
    const clearScrollState = vi.fn()
    const { context, navigated } = fakeContext({ clearScrollState })
    await command('note.new').run(context)
    expect(clearScrollState).toHaveBeenCalledTimes(1)
    expect(navigated).toHaveLength(1)
    const route = navigated[0]!
    expect(route.kind).toBe('note')
    expect((route as { kind: 'note'; path: string }).path).toMatch(/^notes\/[0-9a-z]+\.md$/)
  })

  it('note.new leaves non-daily route scroll restoration intact', async () => {
    const clearScrollState = vi.fn()
    const { context } = fakeContext({
      clearScrollState,
      route: () => ({ kind: 'allNotes', tag: null }),
    })
    await command('note.new').run(context)
    expect(clearScrollState).not.toHaveBeenCalled()
  })

  it('note.openInNewWindow opens the selected note, including the focused daily note', async () => {
    openRouteInNewWindow.mockReset().mockResolvedValue(true)
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await command('note.openInNewWindow').run(context)
    expect(openRouteInNewWindow).toHaveBeenLastCalledWith({
      kind: 'note',
      path: 'notes/a.md',
    })

    const { context: focusedDaily } = fakeContext({
      notePath: () => 'daily/2026-06-18.md',
    })
    await command('note.openInNewWindow').run(focusedDaily)
    expect(openRouteInNewWindow).toHaveBeenLastCalledWith({ kind: 'daily', date: '2026-06-18' })
  })

  it('note.openInNewWindow is inert on a screen with no selected note', async () => {
    openRouteInNewWindow.mockReset().mockResolvedValue(true)
    const { context } = fakeContext({ route: () => ({ kind: 'settings' }) })
    await command('note.openInNewWindow').run(context)
    expect(openRouteInNewWindow).not.toHaveBeenCalled()
  })

  it('note.random navigates to the picked note and no-ops on an empty graph', async () => {
    const { context, navigated } = fakeContext()
    randomNotePath.mockResolvedValueOnce('notes/lucky.md')
    await command('note.random').run(context)
    expect(navigated).toEqual([{ kind: 'note', path: 'notes/lucky.md' }])

    randomNotePath.mockResolvedValueOnce(null)
    await command('note.random').run(context)
    expect(navigated).toHaveLength(1) // unchanged
  })

  it('note.togglePin flips the pin of the note the route edits', async () => {
    toggleNotePinned.mockClear()
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await command('note.togglePin').run(context)
    expect(toggleNotePinned).toHaveBeenCalledWith('notes/a.md', 7)
  })

  it('note.togglePin targets the daily file on daily/today routes', async () => {
    toggleNotePinned.mockClear()
    const { context } = fakeContext({ route: () => ({ kind: 'daily', date: '2026-06-09' }) })
    await command('note.togglePin').run(context)
    expect(toggleNotePinned).toHaveBeenCalledWith('daily/2026-06-09.md', 7)
  })

  it('note.togglePin reports a failed pin as "Pinning note", never an unhandled throw', async () => {
    toggleNotePinned.mockClear()
    startOperation.mockClear()
    getPinnedNotes.mockResolvedValueOnce([])
    toggleNotePinned.mockRejectedValueOnce({ kind: 'io', message: 'disk on fire' })
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    // runCommand has no error channel — the command must absorb and report.
    await expect(command('note.togglePin').run(context)).resolves.toBeUndefined()
    expect(startOperation).toHaveBeenCalledWith('Pinning note')
  })

  it('note.togglePin reports a failed unpin as "Unpinning note"', async () => {
    startOperation.mockClear()
    getPinnedNotes.mockResolvedValueOnce([{ path: 'notes/a.md', title: 'A', dailyDate: null }])
    toggleNotePinned.mockRejectedValueOnce({ kind: 'io', message: 'disk on fire' })
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await expect(command('note.togglePin').run(context)).resolves.toBeUndefined()
    expect(startOperation).toHaveBeenCalledWith('Unpinning note')
  })

  it('note.togglePin no-ops on note-less routes and without a graph', async () => {
    toggleNotePinned.mockClear()
    const { context } = fakeContext({ route: () => ({ kind: 'settings' }) })
    await command('note.togglePin').run(context)
    const { context: noGraph } = fakeContext({ generation: () => null })
    await command('note.togglePin').run(noGraph)
    expect(toggleNotePinned).not.toHaveBeenCalled()
  })

  it('note.togglePrivate flips the flag of the route note without surfacing an operation', async () => {
    toggleNotePrivate.mockClear()
    startOperation.mockClear()
    getNote.mockResolvedValueOnce(noteRow(false))
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await command('note.togglePrivate').run(context)
    expect(toggleNotePrivate).toHaveBeenCalledWith('notes/a.md', 7)
    expect(startOperation).not.toHaveBeenCalled()
  })

  it('note.togglePrivate reports a failed lock as "Locking note"', async () => {
    startOperation.mockClear()
    operationFail.mockClear()
    getNote.mockResolvedValueOnce(noteRow(false))
    toggleNotePrivate.mockRejectedValueOnce({ kind: 'io', message: 'disk on fire' })
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    // runCommand has no error channel — the command must absorb and report.
    await expect(command('note.togglePrivate').run(context)).resolves.toBeUndefined()
    expect(startOperation).toHaveBeenCalledWith('Locking note')
    expect(operationFail).toHaveBeenCalledTimes(1)
  })

  it('note.togglePrivate reports a failed unlock as "Unlocking note"', async () => {
    startOperation.mockClear()
    getNote.mockResolvedValueOnce(noteRow(true))
    toggleNotePrivate.mockRejectedValueOnce({ kind: 'io', message: 'disk on fire' })
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await expect(command('note.togglePrivate').run(context)).resolves.toBeUndefined()
    expect(startOperation).toHaveBeenCalledWith('Unlocking note')
  })

  it('note.copyDeepLink copies the route note through the keyboard command', async () => {
    runCopyDeepLink.mockClear()
    const { context } = fakeContext({ route: () => ({ kind: 'note', path: 'notes/a.md' }) })
    await command('note.copyDeepLink').run(context)
    expect(runCopyDeepLink).toHaveBeenCalledWith('notes/a.md', 7)
  })

  it('note.copyDeepLink no-ops on note-less routes and without a graph', async () => {
    runCopyDeepLink.mockClear()
    const { context } = fakeContext({ route: () => ({ kind: 'settings' }) })
    await command('note.copyDeepLink').run(context)
    const { context: noGraph } = fakeContext({ generation: () => null })
    await command('note.copyDeepLink').run(noGraph)
    expect(runCopyDeepLink).not.toHaveBeenCalled()
  })

  it('dev.toggleDevtools toggles the inspector through the native shell', async () => {
    hasBridge.mockReturnValue(true)
    toggleDevtools.mockClear()
    const { context } = fakeContext()
    await command('dev.toggleDevtools').run(context)
    expect(toggleDevtools).toHaveBeenCalledTimes(1)
  })

  it('dev.toggleDevtools no-ops without a native shell (plain-browser dev)', async () => {
    hasBridge.mockReturnValue(false)
    toggleDevtools.mockClear()
    const { context } = fakeContext()
    await expect(command('dev.toggleDevtools').run(context)).resolves.toBeUndefined()
    expect(toggleDevtools).not.toHaveBeenCalled()
    hasBridge.mockReturnValue(true)
  })


  it('index.rebuild runs at the open generation and reports as an operation', async () => {
    try {
      rebuildIndex.mockResolvedValueOnce(undefined)
      const { context } = fakeContext()
      await command('index.rebuild').run(context)
      expect(rebuildIndex).toHaveBeenCalledWith(
        expect.objectContaining({ generation: 7, onSkippedNote: expect.any(Function) }),
      )

      // No graph open → no rebuild.
      rebuildIndex.mockClear()
      const { context: noGraph } = fakeContext({ generation: () => null })
      await command('index.rebuild').run(noGraph)
      expect(rebuildIndex).not.toHaveBeenCalled()
    } finally {
      resetOperations()
    }
  })

  it('day.next / day.previous step the shown day (the notePath anchor)', async () => {
    const { context, navigated } = fakeContext({
      route: () => ({ kind: 'daily', date: '2026-06-09' }),
    })
    await command('day.next').run(context)
    await command('day.previous').run(context)
    expect(navigated).toEqual([
      { kind: 'daily', date: '2026-06-10' },
      { kind: 'daily', date: '2026-06-08' },
    ])
  })

  it('a day step that lands on the live day routes today', async () => {
    const yesterday = addDaysIso(todayIso(), -1)
    const { context, navigated } = fakeContext({
      route: () => ({ kind: 'daily', date: yesterday }),
    })
    await command('day.next').run(context)
    expect(navigated).toEqual([{ kind: 'today' }])
  })

  it('day steps are no-ops off the daily views', async () => {
    const { context, navigated } = fakeContext({
      route: () => ({ kind: 'allNotes', tag: null }),
    })
    await command('day.next').run(context)
    await command('day.previous').run(context)
    expect(navigated).toEqual([])
  })
})

describe('keybindingFor', () => {
  it('reflects a user override and falls back to the default when cleared', () => {
    try {
      setCommandKeybindingOverride('note.insertTimestamp', 'Alt-Mod-t', 'Mod-Shift-t')
      expect(keybindingFor('note.insertTimestamp')).toBe('Alt-Mod-t')
    } finally {
      resetKeybindingOverridesForTests()
    }
    expect(keybindingFor('note.insertTimestamp')).toBe('Mod-Shift-t')
  })
})
