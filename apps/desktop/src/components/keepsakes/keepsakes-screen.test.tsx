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
const onWikilinkClick = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-backlink-navigation', () => ({
  useBacklinkNavigation: () => ({
    openSource: () => {},
    onWikilinkClick,
    resolveImageUrl: () => undefined,
  }),
}))
const settingsState = vi.hoisted(() => ({ keepsakesGrouping: 'month' as 'month' | 'subject' }))
const updateSettings = vi.hoisted(() => vi.fn())
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: settingsState, updateSettings }),
}))

function keepsake(overrides: Partial<Keepsake> & Pick<Keepsake, 'text'>): Keepsake {
  return {
    notePath: 'daily/2026-09-09.md',
    noteTitle: '2026-09-09',
    dailyDate: '2026-09-09',
    updatedAt: 0,
    markerOffset: 0,
    markerIndex: 0,
    kind: 'line',
    markdown: overrides.text,
    links: [],
    leadLink: null,
    markdownAfterLead: overrides.markdown ?? overrides.text,
    subjects: [],
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
  onWikilinkClick.mockReset()
  updateSettings.mockReset()
  settingsState.keepsakesGrouping = 'month'
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

  it('opens the keepsake itself — its note, landed on it — when its words are clicked', async () => {
    getKeepsakes.mockResolvedValue([keepsake({ text: 'a kept line', markerIndex: 3 })])

    renderScreen()
    await userEvent.click(await screen.findByText('a kept line'))

    expect(navigateNoteLink).toHaveBeenCalledWith(
      { kind: 'daily', date: '2026-09-09' },
      expect.anything(),
      { revealKeepsake: 3 },
    )
  })

  it('opens the keepsake from its day label, the keyboard way in', async () => {
    getKeepsakes.mockResolvedValue([keepsake({ text: 'a kept line', markerIndex: 1 })])

    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: /Open where it was kept/i }))

    expect(navigateNoteLink).toHaveBeenCalledWith(
      { kind: 'daily', date: '2026-09-09' },
      expect.anything(),
      { revealKeepsake: 1 },
    )
  })

  it('renders a kept section with its structure', async () => {
    getKeepsakes.mockResolvedValue([
      keepsake({
        text: 'points',
        kind: 'section',
        markdown: '几个有意思的点：\n\n1. 用 geohash 的前缀做 cache key\n1. 单机的乐观锁',
      }),
    ])

    const { container } = renderScreen()

    expect(await screen.findByText('用 geohash 的前缀做 cache key')).toBeTruthy()
    expect(screen.getByText('单机的乐观锁')).toBeTruthy()
    expect(container.querySelectorAll('.prosemirror-flat-list')).toHaveLength(2)
  })

  it('follows a wiki link written in a keepsake instead of opening the keepsake', async () => {
    getKeepsakes.mockResolvedValue([
      keepsake({ text: 'that Sancerre', markdown: 'that Sancerre — [[Wine]]', links: ['Wine'] }),
    ])

    renderScreen()
    await userEvent.click(await screen.findByText('Wine'))

    expect(onWikilinkClick).toHaveBeenCalledWith(expect.objectContaining({ target: 'Wine' }))
    expect(navigateNoteLink).not.toHaveBeenCalled()
  })

  it('switches the division from the header', async () => {
    getKeepsakes.mockResolvedValue([keepsake({ text: 'a kept line' })])

    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Subjects' }))

    expect(updateSettings).toHaveBeenCalledWith({ keepsakesGrouping: 'subject' })
  })

  it('groups by subject, as written, with the unlinked last', async () => {
    settingsState.keepsakesGrouping = 'subject'
    const sd = { target: 'SD', notePath: 'notes/sd.md', key: 'notes/sd.md' }
    getKeepsakes.mockResolvedValue([
      keepsake({ text: 'unlinked thought', markerOffset: 1 }),
      keepsake({
        text: 'SD CDC',
        markdown: '[[SD]] CDC change data capture',
        markdownAfterLead: 'CDC change data capture',
        leadLink: 'SD',
        links: ['SD'],
        subjects: [sd],
        markerOffset: 2,
      }),
    ])

    renderScreen()

    expect(await screen.findByText('CDC change data capture')).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['SD', 'No subject'])

    await userEvent.click(screen.getByRole('button', { name: 'SD' }))
    expect(navigateNoteLink).toHaveBeenCalledWith({ kind: 'note', path: 'notes/sd.md' }, expect.anything())
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
