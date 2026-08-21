import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { open } from '@tauri-apps/plugin-dialog'
import { setBridge } from '@dayjot/core'
import { GraphProvider, useGraph } from './graph-provider'
import { SettingsProvider } from './settings-provider'
import { ICLOUD_STATUS_QUERY_KEY, queryClient as appQueryClient } from '@/lib/query-client'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

/**
 * Exercises the provider's open-ordering guards: overlapping opens are
 * serialized against the backend and only the most recently requested one may
 * commit UI state.
 */

let invokeLog: string[]
/** Pending `graph_open` resolvers keyed by requested root. */
let pendingOpens: Map<string, () => void>
let failOpens: boolean
/** What `recent_graphs` returns — set before render to simulate prior opens. */
let storedRecents: Array<{ root: string; name: string; openedMs: number }>
/** What `list_files` returns — set before render to simulate existing notes. */
let storedFiles: Array<{ path: string; size: number; modifiedMs: number }>
/** The fake `index_meta` table (the welcome marker lives here). */
let metaStore: Record<string, string>
/** The fake settings document. */
let settingsStore: Record<string, unknown>
/** A fresh QueryClient per test — the settings provider reads through it. */
let queryClient: QueryClient

function installFakeBridge(): void {
  invokeLog = []
  pendingOpens = new Map()
  failOpens = false
  storedRecents = []
  storedFiles = []
  metaStore = {}
  settingsStore = {}
  let generation = 0
  setBridge({
    invoke: async (command, args) => {
      invokeLog.push(
        command === 'graph_open' || command === 'graph_create'
          ? `${command}:${String(args['path'])}`
          : command,
      )
      switch (command) {
        case 'graph_create': {
          const root = String(args['path'])
          generation += 1
          return { root, name: root.split('/').filter(Boolean).at(-1) ?? '', generation }
        }
        case 'graph_open': {
          if (failOpens) {
            throw { kind: 'io', message: 'cannot open graph' }
          }
          const root = String(args['path'])
          await new Promise<void>((resolve) => {
            pendingOpens.set(root, resolve)
          })
          generation += 1
          return { root, name: root.split('/').filter(Boolean).at(-1) ?? '', generation }
        }
        case 'recent_graphs':
          return storedRecents
        case 'forget_recent':
          storedRecents = storedRecents.filter((recent) => recent.root !== String(args['root']))
          return null
        case 'settings_load':
          return settingsStore
        case 'settings_save':
          settingsStore = args['settings'] as Record<string, unknown>
          return null
        case 'index_open':
          return generation
        case 'list_files':
          return storedFiles
        case 'index_meta_set':
          metaStore[String(args['key'])] = String(args['value'])
          return null
        case 'db_query': {
          // The only meta read the provider issues is the welcome marker.
          const sql = String(args['sql'] ?? '')
          if (/index_?meta/i.test(sql)) {
            const key = String((args['params'] as unknown[])?.[0])
            return key in metaStore ? [{ value: metaStore[key] }] : []
          }
          return []
        }
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
}

function resolveOpen(root: string): void {
  pendingOpens.get(root)?.()
  pendingOpens.delete(root)
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <GraphProvider>{children}</GraphProvider>
    </SettingsProvider>
  </QueryClientProvider>
)

beforeEach(() => {
  installFakeBridge()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  setBridge(null)
})

describe('GraphProvider open sequencing', () => {
  it('starts at the chooser when there are no recents', async () => {
    const { result } = renderHook(() => useGraph(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('choosing'))
    expect(result.current.graph).toBeNull()
  })

  it('serializes overlapping opens and commits only the last requested graph', async () => {
    const { result } = renderHook(() => useGraph(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('choosing'))

    let firstOpen: Promise<boolean>
    let secondOpen: Promise<boolean>
    act(() => {
      firstOpen = result.current.openRecent('/a')
      secondOpen = result.current.openRecent('/b')
    })

    // The second backend open must wait for the first (Rust GraphState is
    // last-write-wins; running in request order keeps it on the last graph).
    await waitFor(() => expect(invokeLog).toContain('graph_open:/a'))
    expect(invokeLog).not.toContain('graph_open:/b')

    await act(async () => {
      resolveOpen('/a')
      await waitFor(() => expect(invokeLog).toContain('graph_open:/b'))
      resolveOpen('/b')
      await firstOpen
      await secondOpen
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    // The superseded first open must not have committed its graph.
    expect(result.current.graph?.root).toBe('/b')
  })

  it('closes note windows BEFORE the backend open bumps the session', async () => {
    // Note windows adopted the outgoing session; their close-requested
    // flushes must land against its still-valid generation, so the close
    // command precedes graph_open (bump-first would reject the saves).
    const { result } = renderHook(() => useGraph(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('choosing'))

    let opened: Promise<boolean>
    act(() => {
      opened = result.current.openRecent('/a')
    })
    await waitFor(() => expect(invokeLog).toContain('graph_open:/a'))
    expect(invokeLog.indexOf('close_note_windows')).toBeGreaterThanOrEqual(0)
    expect(invokeLog.indexOf('close_note_windows')).toBeLessThan(
      invokeLog.indexOf('graph_open:/a'),
    )
    await act(async () => {
      resolveOpen('/a')
      await opened
    })
  })

  it('surfaces an open failure and returns to the chooser', async () => {
    const { result } = renderHook(() => useGraph(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('choosing'))

    failOpens = true
    await act(async () => {
      await result.current.openRecent('/broken')
    })

    expect(result.current.status).toBe('choosing')
    expect(result.current.error).toMatch(/cannot open graph/)
  })

  it('forgets the open graph and returns to the chooser', async () => {
    storedRecents = [{ root: '/known', name: 'known', openedMs: 1 }]
    const { result } = renderHook(() => useGraph(), { wrapper })

    await act(async () => {
      await waitFor(() => expect(pendingOpens.has('/known')).toBe(true))
      resolveOpen('/known')
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.forget('/known')
    })

    expect(result.current.status).toBe('choosing')
    expect(result.current.graph).toBeNull()
    expect(result.current.indexGeneration).toBeNull()
    expect(result.current.recents).toEqual([])
  })

  it('drops the cached iCloud listing when the graph is deleted', async () => {
    storedRecents = [{ root: '/known', name: 'known', openedMs: 1 }]
    const { result } = renderHook(() => useGraph(), { wrapper })

    await act(async () => {
      await waitFor(() => expect(pendingOpens.has('/known')).toBe(true))
      resolveOpen('/known')
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    // The chooser's listing was cached before the delete; without the drop it
    // would keep showing the deleted graph (queries never go stale on their own).
    appQueryClient.setQueryData(ICLOUD_STATUS_QUERY_KEY, {
      available: true,
      documentsRoot: '/icloud/Documents',
      existingGraphRoots: ['/known'],
    })

    await act(async () => {
      await result.current.deleteGraph()
    })

    expect(invokeLog).toContain('graph_delete')
    expect(result.current.status).toBe('choosing')
    expect(appQueryClient.getQueryData(ICLOUD_STATUS_QUERY_KEY)).toBeUndefined()
  })

  it('returns to the graph chooser without opening the folder picker', async () => {
    storedRecents = [{ root: '/known', name: 'known', openedMs: 1 }]
    const { result } = renderHook(() => useGraph(), { wrapper })

    await act(async () => {
      await waitFor(() => expect(pendingOpens.has('/known')).toBe(true))
      resolveOpen('/known')
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    vi.mocked(open).mockClear()
    await act(async () => {
      await result.current.chooseGraph()
    })

    expect(result.current.status).toBe('choosing')
    expect(result.current.graph).toBeNull()
    expect(result.current.indexGeneration).toBeNull()
    expect(open).not.toHaveBeenCalled()
    expect(result.current.recents).toEqual(storedRecents)
  })
})

describe('GraphProvider welcome seeding', () => {
  it('seeds an empty unmarked graph and stamps the welcomeSeeded marker', async () => {
    vi.mocked(open).mockResolvedValue('/fresh')
    const { result } = renderHook(() => useGraph(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('choosing'))

    await act(async () => {
      const picking = result.current.pickAndOpen()
      await waitFor(() => expect(pendingOpens.has('/fresh')).toBe(true))
      resolveOpen('/fresh')
      await picking
    })

    expect(result.current.status).toBe('ready')
    expect(invokeLog).toContain('note_write')
    expect(metaStore['welcomeSeeded']).toBe('true')
  })

  it('never seeds a marked graph, even when it is empty (deleted notes stay deleted)', async () => {
    storedRecents = [{ root: '/known', name: 'known', openedMs: 1 }]
    metaStore['welcomeSeeded'] = 'true'
    const { result } = renderHook(() => useGraph(), { wrapper })

    await act(async () => {
      await waitFor(() => expect(pendingOpens.has('/known')).toBe(true))
      resolveOpen('/known')
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(invokeLog).not.toContain('note_write')
  })

  it('marks an unmarked graph with existing notes without writing into it', async () => {
    storedRecents = [{ root: '/existing', name: 'existing', openedMs: 1 }]
    storedFiles = [{ path: 'daily/2026-06-12.md', size: 10, modifiedMs: 0 }]
    const { result } = renderHook(() => useGraph(), { wrapper })

    await act(async () => {
      await waitFor(() => expect(pendingOpens.has('/existing')).toBe(true))
      resolveOpen('/existing')
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(invokeLog).not.toContain('note_write')
    // Onboarding was considered: emptying this graph later won't re-seed.
    expect(metaStore['welcomeSeeded']).toBe('true')
  })
})
