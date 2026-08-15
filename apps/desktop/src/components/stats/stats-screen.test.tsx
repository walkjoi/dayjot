import { cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { RouterProvider } from '@/routing/router'
import { StatsScreen } from './stats-screen'

const getDailyNoteDates = vi.hoisted(() => vi.fn())
const getDailyWeights = vi.hoisted(() => vi.fn())
const getDailyWordCounts = vi.hoisted(() => vi.fn())
const getNoteCount = vi.hoisted(() => vi.fn())
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  hasBridge: () => true,
  getDailyNoteDates,
  getDailyWeights,
  getDailyWordCounts,
  getNoteCount,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))
vi.mock('@/lib/use-today', () => ({ useToday: () => '2026-08-14' }))

// The charts mount recharts, which jsdom can't measure; the section-level
// behavior (shown vs absent) is what this screen owns.
vi.mock('./weight-chart', () => ({
  WeightChart: () => <section aria-label="Weight" data-testid="weight-chart" />,
}))
vi.mock('./words-chart', () => ({
  WordsChart: () => <section aria-label="Words per day" data-testid="words-chart" />,
}))

function renderScreen(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view: ReactElement = (
    <QueryClientProvider client={client}>
      <RouterProvider initialRoute={{ kind: 'stats' }}>
        <StatsScreen />
      </RouterProvider>
    </QueryClientProvider>
  )
  return render(view)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StatsScreen', () => {
  it('shows streaks, words today, and the note count from the index', async () => {
    getDailyNoteDates.mockResolvedValue(['2026-08-12', '2026-08-13', '2026-08-14'])
    getDailyWeights.mockResolvedValue([])
    getDailyWordCounts.mockResolvedValue([{ date: '2026-08-14', words: 1234 }])
    getNoteCount.mockResolvedValue(57)

    const view = renderScreen()

    await waitFor(() => expect(view.getByText('1,234')).toBeTruthy())
    expect(view.getByText('Current streak').nextSibling?.textContent).toBe('3')
    expect(view.getByText('Longest streak').nextSibling?.textContent).toBe('3')
    expect(view.getByText('57')).toBeTruthy()
  })

  it('renders no weight section at all when nothing was ever logged', async () => {
    getDailyNoteDates.mockResolvedValue([])
    getDailyWeights.mockResolvedValue([])
    getDailyWordCounts.mockResolvedValue([])
    getNoteCount.mockResolvedValue(0)

    const view = renderScreen()

    await waitFor(() => expect(view.getByText('Notes')).toBeTruthy())
    expect(view.queryByTestId('weight-chart')).toBeNull()
    expect(view.queryByTestId('words-chart')).toBeNull()
  })

  it('shows the weight section once entries exist', async () => {
    getDailyNoteDates.mockResolvedValue(['2026-08-14'])
    getDailyWeights.mockResolvedValue([
      { date: '2026-08-14', kg: 72.5, notePath: 'daily/2026-08-14.md' },
    ])
    getDailyWordCounts.mockResolvedValue([{ date: '2026-08-14', words: 10 }])
    getNoteCount.mockResolvedValue(1)

    const view = renderScreen()

    await waitFor(() => expect(view.getByTestId('weight-chart')).toBeTruthy())
    expect(view.getByTestId('words-chart')).toBeTruthy()
  })
})
