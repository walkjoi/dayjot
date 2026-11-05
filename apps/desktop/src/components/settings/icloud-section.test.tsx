import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@dayjot/core'
import { IcloudSettingsField } from './icloud-section'

const graphState = vi.hoisted(() => ({
  graph: { root: '/Users/alex/Documents/Notes', name: 'Notes', generation: 4 },
  openRecent: vi.fn(async () => true),
}))
vi.mock('@/lib/platform', () => ({ isMacosDesktop: true }))
vi.mock('@/providers/graph-provider', () => ({ useGraph: () => graphState }))
vi.mock('@/providers/sync-provider', () => ({
  useSync: () => ({ backup: { phase: 'disconnected' }, disconnectGraph: vi.fn(async () => {}) }),
}))

const ICLOUD_ROOT = '/Users/alex/Library/Mobile Documents/iCloud~app/Documents'

let releaseAdopt: (() => void) | null

beforeEach(() => {
  releaseAdopt = null
  setBridge({
    invoke: async (command: string) => {
      switch (command) {
        case 'icloud_status':
          return { available: true, documentsRoot: ICLOUD_ROOT, existingGraphRoots: [] }
        case 'icloud_adopt_graph':
          await new Promise<void>((resolve) => {
            releaseAdopt = resolve
          })
          return `${ICLOUD_ROOT}/Notes`
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
})

afterEach(() => {
  cleanup()
  setBridge(null)
  graphState.openRecent.mockClear()
})

describe('IcloudSettingsField', () => {
  it('keeps the Move to iCloud confirmation open until the move settles', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <IcloudSettingsField />
      </QueryClientProvider>,
    )

    const trigger = await screen.findByRole('button', { name: 'Move graph to iCloud…' })
    await waitFor(() => {
      expect(trigger).toHaveProperty('disabled', false)
    })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Move to iCloud' }))
    expect(screen.getByRole('button', { name: 'Moving…' })).toBeTruthy()

    // Escape mid-move must not hide a copy that is still running.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeTruthy()

    releaseAdopt?.()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(graphState.openRecent).toHaveBeenCalledWith(`${ICLOUD_ROOT}/Notes`)
  })
})
