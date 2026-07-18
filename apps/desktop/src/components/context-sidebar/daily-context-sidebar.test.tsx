import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteRow } from '@dayjot/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RouterProvider } from '@/routing/router'
import { DailyContextSidebar } from './daily-context-sidebar'

const useNoteRow = vi.hoisted(() => vi.fn<(path: string) => NoteRow | null>(() => null))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  hasBridge: () => true,
}))
vi.mock('@/hooks/use-note-row', () => ({ useNoteRow }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: { dateFormat: 'mdy', weekStartDay: 'monday' },
    updateSettings: () => {},
  }),
}))

function renderSidebar(date: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <TooltipProvider>
      <QueryClientProvider client={client}>
        <RouterProvider>
          <DailyContextSidebar date={date} />
        </RouterProvider>
      </QueryClientProvider>
    </TooltipProvider>,
  )
}

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    path: 'daily/2026-06-09.md',
    title: '2026-06-09',
    dailyDate: '2026-06-09',
    isPrivate: false,
    hasConflict: false,
    gistUrl: null,
    gistStale: false,
    ...overrides,
  }
}

beforeEach(() => {
  window.sessionStorage.clear()
  useNoteRow.mockReset().mockReturnValue(null)
})

afterEach(cleanup)

describe('DailyContextSidebar sections', () => {
  it('collapses a section and persists the state for the session', async () => {
    useNoteRow.mockReturnValue(noteRow({ gistUrl: 'https://gist.github.com/alex/daily1' }))
    const view = renderSidebar('2026-06-09')
    const header = view.getByRole('button', { name: /Published URL/ })
    expect(header.getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    view.unmount()

    const reopened = renderSidebar('2026-06-09')
    expect(
      reopened.getByRole('button', { name: /Published URL/ }).getAttribute('aria-expanded'),
    ).toBe('false')
    reopened.unmount()
  })
})

describe('DailyContextSidebar published link', () => {
  it('shows the Published URL section once the daily note is published', () => {
    const url = 'https://gist.github.com/alex/daily1'
    useNoteRow.mockReturnValue(noteRow({ gistUrl: url }))
    const view = renderSidebar('2026-06-09')
    expect(view.getByText('Published URL')).toBeDefined()
    expect(view.getByRole('link', { name: url }).getAttribute('href')).toBe(url)
    view.unmount()
  })

  it('omits the Published URL section for an unpublished daily note', () => {
    const view = renderSidebar('2026-06-09')
    expect(view.queryByText('Published URL')).toBeNull()
    view.unmount()
  })
})
