import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@dayjot/core'
import { hasPendingGithubSetup } from '@/lib/pending-github-setup'
import { GraphProvider } from '@/providers/graph-provider'
import { SettingsProvider } from '@/providers/settings-provider'
import { GraphChooser } from './graph-chooser'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/api/path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/path')>()),
  documentDir: vi.fn(async () => '/Users/alex/Documents'),
}))

let invokeLog: Array<[string, Record<string, unknown>]>
let graphCreateFailure: string | null
let recents: Array<{ root: string; name: string; openedMs: number }>
let storedSettings: Record<string, unknown>
let icloudStatusResponse: {
  available: boolean
  documentsRoot: string | null
  existingGraphRoots: string[]
}
let queryClient: QueryClient

// Mirrors the main.tsx provider order: settings above the graph lifecycle.
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <GraphProvider>{children}</GraphProvider>
    </SettingsProvider>
  </QueryClientProvider>
)

beforeEach(() => {
  vi.stubEnv('TAURI_ENV_PLATFORM', 'darwin')
  invokeLog = []
  graphCreateFailure = null
  recents = [
    { root: '/graphs/work', name: 'work', openedMs: 2 },
    { root: '/graphs/personal', name: 'personal', openedMs: 1 },
  ]
  storedSettings = {}
  icloudStatusResponse = { available: false, documentsRoot: null, existingGraphRoots: [] }
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  setBridge({
    invoke: async (command, args) => {
      invokeLog.push([command, args])
      switch (command) {
        case 'recent_graphs':
          return recents
        case 'forget_recent':
          recents = recents.filter((recent) => recent.root !== args['root'])
          return null
        case 'graph_create':
          if (graphCreateFailure !== null) {
            throw new Error(graphCreateFailure)
          }
          return { root: String(args['path']), name: 'work', generation: 1 }
        case 'graph_open':
          return { root: String(args['path']), name: 'work', generation: 1 }
        case 'icloud_status':
          return icloudStatusResponse
        case 'index_open':
          return 1
        case 'list_files':
        case 'db_query':
          return []
        case 'settings_load':
          return storedSettings
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
})

afterEach(() => {
  cleanup() // `globals: false` disables testing-library's automatic cleanup
  vi.unstubAllEnvs()
  setBridge(null)
  queryClient.clear()
  window.sessionStorage.clear()
})

describe('GraphChooser', () => {
  it('leads with GitHub sync (recommended) beside the iCloud card', async () => {
    icloudStatusResponse = {
      available: true,
      documentsRoot: '/icloud/Documents',
      existingGraphRoots: [],
    }
    render(<GraphChooser />, { wrapper })

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'iCloud' })).toBeInTheDocument(),
    )
    const github = screen.getByRole('region', { name: 'GitHub sync' })
    expect(within(github).getByText('Recommended')).toBeInTheDocument()
    // Exactly one recommendation on screen — iCloud lost its badge.
    expect(screen.getAllByText('Recommended')).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /choose a folder on this Mac/i }),
    ).toBeInTheDocument()
  })

  it('creates the GitHub-backed graph in Documents and hands off to the wizard', async () => {
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    const github = await screen.findByRole('region', { name: 'GitHub sync' })
    const nameInput = within(github).getByRole('textbox', { name: 'Name' })
    expect(nameInput).toHaveValue('Notes')
    await user.clear(nameInput)
    await user.type(nameInput, 'My Notes')
    await user.click(within(github).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(invokeLog).toContainEqual([
        'graph_create',
        { path: '/Users/alex/Documents/My Notes' },
      ]),
    )
    // The workspace reads this flag and opens the Connect-GitHub wizard.
    expect(hasPendingGithubSetup()).toBe(true)
  })

  it('drops the wizard handoff when the create fails', async () => {
    graphCreateFailure = 'disk full'
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    const github = await screen.findByRole('region', { name: 'GitHub sync' })
    await user.click(within(github).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(invokeLog).toContainEqual(['graph_create', { path: '/Users/alex/Documents/Notes' }]),
    )
    await waitFor(() => expect(hasPendingGithubSetup()).toBe(false))
    expect(screen.getByText('disk full')).toBeInTheDocument()
  })

  it('creates an iCloud graph from the typed name', async () => {
    icloudStatusResponse = {
      available: true,
      documentsRoot: '/icloud/Documents',
      existingGraphRoots: [],
    }
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    const icloud = await screen.findByRole('region', { name: 'iCloud' })
    const nameInput = within(icloud).getByRole('textbox', { name: 'Name' })
    await user.clear(nameInput)
    await user.type(nameInput, 'My Notes')
    await user.click(within(icloud).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(invokeLog).toContainEqual(['graph_create', { path: '/icloud/Documents/My Notes' }]),
    )
  })

  it('lists every graph already in the container and opens the clicked one', async () => {
    icloudStatusResponse = {
      available: true,
      documentsRoot: '/icloud/Documents',
      existingGraphRoots: ['/icloud/Documents/Notes', '/icloud/Documents/Work'],
    }
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    await screen.findByRole('button', { name: 'Notes' })
    expect(screen.getByText('Open an existing graph from iCloud Drive.')).toBeInTheDocument()
    expect(screen.getByText('or create new graph')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Work' }))

    await waitFor(() =>
      expect(invokeLog).toContainEqual(['graph_open', { path: '/icloud/Documents/Work' }]),
    )
  })

  it('creates a new graph alongside existing ones, refusing taken names', async () => {
    icloudStatusResponse = {
      available: true,
      documentsRoot: '/icloud/Documents',
      existingGraphRoots: ['/icloud/Documents/Notes'],
    }
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    // Wait for the status to land (the existing graph is listed) so the
    // compact create row — not the pre-status empty-container form — is the
    // input under test. Next to an existing list the row starts empty.
    await screen.findByRole('button', { name: 'Notes' })
    const icloud = screen.getByRole('region', { name: 'iCloud' })
    const nameInput = within(icloud).getByRole('textbox', { name: 'Name' })
    expect(nameInput).toHaveValue('')
    expect(within(icloud).getByRole('button', { name: 'Create' })).toBeDisabled()

    // "notes" collides (case-insensitively) with the existing graph —
    // creating it would land inside that folder, so Create refuses and the
    // field says why.
    await user.type(nameInput, 'notes')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('That name already exists in iCloud Drive.')).toBeInTheDocument()
    expect(within(icloud).getByRole('button', { name: 'Create' })).toBeDisabled()

    await user.clear(nameInput)
    await user.type(nameInput, 'Journal')
    expect(screen.queryByText('That name already exists in iCloud Drive.')).not.toBeInTheDocument()
    await user.click(within(icloud).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(invokeLog).toContainEqual(['graph_create', { path: '/icloud/Documents/Journal' }]),
    )
  })

  it('explains itself when iCloud is unreachable and disables Create', async () => {
    render(<GraphChooser />, { wrapper })

    await waitFor(() =>
      expect(screen.getByText(/Sign in to iCloud on this Mac/)).toBeInTheDocument(),
    )
    const icloud = screen.getByRole('region', { name: 'iCloud' })
    expect(within(icloud).getByRole('button', { name: 'Create' })).toBeDisabled()
    // The GitHub path stays live — it doesn't depend on iCloud at all.
    const github = screen.getByRole('region', { name: 'GitHub sync' })
    expect(within(github).getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('hides the iCloud card outside macOS builds and keeps the GitHub + folder paths', async () => {
    vi.stubEnv('TAURI_ENV_PLATFORM', 'windows')
    render(<GraphChooser />, { wrapper })

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'GitHub sync' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading', { name: 'iCloud' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /choose a folder on this computer/i }),
    ).toBeInTheDocument()
  })

  // The provider auto-opens the most recent graph on mount, so the chooser's
  // own flows are exercised after that first open settles.
  it('lists recent graphs and reopens one on click', async () => {
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    await waitFor(() => expect(screen.getByText('personal')).toBeInTheDocument())
    expect(screen.getByText('/graphs/personal')).toBeInTheDocument()

    await user.click(screen.getByText('personal'))
    await waitFor(() =>
      expect(invokeLog).toContainEqual(['graph_open', { path: '/graphs/personal' }]),
    )
  })

  it('forgets a recent graph and refreshes the list', async () => {
    const user = userEvent.setup()
    render(<GraphChooser />, { wrapper })

    await waitFor(() => expect(screen.getByText('personal')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Forget personal' }))

    await waitFor(() => expect(screen.queryByText('personal')).not.toBeInTheDocument())
    expect(invokeLog).toContainEqual(['forget_recent', { root: '/graphs/personal' }])
  })

  it('tints a recent folder icon with the chosen graph color, muted otherwise', async () => {
    storedSettings = { graphColors: { '/graphs/personal': 'teal' } }
    render(<GraphChooser />, { wrapper })

    await waitFor(() => expect(screen.getByText('personal')).toBeInTheDocument())
    const personalIcon = screen.getByText('personal').closest('button')?.querySelector('svg')
    await waitFor(() => expect(personalIcon).toHaveStyle({ color: '#14b8a6' }))

    const workIcon = screen.getByText('work').closest('button')?.querySelector('svg')
    expect(workIcon).toHaveClass('text-text-muted')
  })
})
