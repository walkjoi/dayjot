import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { Keepsake } from '@dayjot/core'
import { RouterProvider } from '@/routing/router'
import { KeepsakesScreen } from './keepsakes-screen'

const getKeepsakes = vi.hoisted(() => vi.fn())
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  hasBridge: () => true,
  getKeepsakes,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))

const navigateNoteLink = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-note-link-navigation', () => ({
  useNoteLinkNavigation: () => navigateNoteLink,
}))
const navigateWikiLink = vi.hoisted(() => vi.fn())
vi.mock('@/editor/use-wiki-link-navigation', () => ({
  useWikiLinkNavigation: () => navigateWikiLink,
}))

function keepsake(overrides: Partial<Keepsake> & Pick<Keepsake, 'text'>): Keepsake {
  return {
    notePath: 'daily/2026-09-09.md',
    noteTitle: '2026-09-09',
    dailyDate: '2026-09-09',
    updatedAt: 0,
    markerOffset: 0,
    links: [],
    ...overrides,
  }
}

function renderScreen(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view: ReactElement = (
    <QueryClientProvider client={client}>
      <RouterProvider initialRoute={{ kind: 'keepsakes' }}>
        <KeepsakesScreen />
      </RouterProvider>
    </QueryClientProvider>
  )
  return render(view)
}

afterEach(() => {
  cleanup()
  getKeepsakes.mockReset()
  navigateNoteLink.mockReset()
  navigateWikiLink.mockReset()
})

describe('KeepsakesScreen', () => {
  it('renders the fragments under their month rules', async () => {
    getKeepsakes.mockResolvedValue([
      keepsake({ text: '妈妈说的那句话' }),
      keepsake({
        text: 'the fog came over the ridge in one piece',
        dailyDate: '2026-08-11',
        notePath: 'daily/2026-08-11.md',
        markerOffset: 4,
      }),
    ])

    renderScreen()

    expect(await screen.findByText('妈妈说的那句话')).toBeTruthy()
    expect(screen.getByText('the fog came over the ridge in one piece')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /September 2026/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /August 2026/i })).toBeTruthy()
  })

  it('opens the day a fragment came from when it is clicked', async () => {
    getKeepsakes.mockResolvedValue([keepsake({ text: 'a kept line' })])

    renderScreen()
    await userEvent.click(await screen.findByText('a kept line'))

    expect(navigateNoteLink).toHaveBeenCalledWith(
      { kind: 'daily', date: '2026-09-09' },
      expect.anything(),
    )
  })

  it('offers the subjects written on a line, and opens one when clicked', async () => {
    getKeepsakes.mockResolvedValue([keepsake({ text: 'that Sancerre', links: ['Wine'] })])

    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Wine' }))

    expect(navigateWikiLink).toHaveBeenCalledWith('Wine', expect.anything())
  })

  it('says what the box is for while it is empty, and nothing more', async () => {
    getKeepsakes.mockResolvedValue([])

    renderScreen()

    expect(await screen.findByText(/Nothing kept yet/i)).toBeTruthy()
  })

  it('shows no empty state while the first read is still in flight', async () => {
    getKeepsakes.mockReturnValue(new Promise(() => {}))

    renderScreen()

    await waitFor(() => expect(screen.getByLabelText('Keepsakes')).toBeTruthy())
    expect(screen.queryByText(/Nothing kept yet/i)).toBeNull()
  })
})
