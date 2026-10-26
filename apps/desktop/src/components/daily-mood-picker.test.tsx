import { act, cleanup, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyMood } from '@dayjot/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { DailyMoodPicker } from './daily-mood-picker'

const getDailyMoods = vi.hoisted(() => vi.fn<() => Promise<DailyMood[]>>())
const rateDailyNote = vi.hoisted(() =>
  vi.fn<(path: string, rating: number | null, generation: number) => Promise<void>>(),
)
const getPeriodDays = vi.hoisted(() => vi.fn<() => Promise<string[]>>())
const markPeriodDay = vi.hoisted(() =>
  vi.fn<(path: string, isPeriodDay: boolean, generation: number) => Promise<void>>(),
)
const failOperation = vi.hoisted(() => vi.fn<(message: string) => void>())
vi.mock('@/lib/note-mood', () => ({ rateDailyNote }))
vi.mock('@/lib/note-period', () => ({ markPeriodDay }))
vi.mock('@/lib/operations', () => ({ startOperation: () => ({ fail: failOperation }) }))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  hasBridge: () => true,
  getDailyMoods,
  getPeriodDays,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))
vi.mock('@/lib/use-today', () => ({ useToday: () => '2026-10-26' }))

function renderPicker(date: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <DailyMoodPicker date={date} />
    </QueryClientProvider>,
  )
  return { view, client }
}

function pressed(view: ReturnType<typeof render>): string[] {
  return within(view.getByRole('group', { name: 'Mood' }))
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent ?? '')
}

beforeEach(() => {
  getDailyMoods.mockReset().mockResolvedValue([])
  rateDailyNote.mockReset().mockResolvedValue(undefined)
  getPeriodDays.mockReset().mockResolvedValue([])
  markPeriodDay.mockReset().mockResolvedValue(undefined)
  failOperation.mockReset()
})

afterEach(cleanup)

describe('DailyMoodPicker', () => {
  it('offers Awful through Great and shows the indexed rating as pressed', async () => {
    getDailyMoods.mockResolvedValue([{ date: '2026-10-26', rating: 4 }])
    const { view } = renderPicker('2026-10-26')

    expect(view.getByText('How was today?')).toBeTruthy()
    const moodButtons = within(view.getByRole('group', { name: 'Mood' })).getAllByRole('button')
    expect(moodButtons.map((button) => button.textContent)).toEqual([
      'Awful',
      'Bad',
      'Okay',
      'Good',
      'Great',
    ])
    await waitFor(() => expect(pressed(view)).toEqual(['Good']))
  })

  it("writes the pick into the day's note and shows it at once, ahead of the index", async () => {
    const { view } = renderPicker('2026-10-26')

    await userEvent.click(view.getByRole('button', { name: 'Great' }))

    expect(rateDailyNote).toHaveBeenCalledWith('daily/2026-10-26.md', 5, 1)
    expect(pressed(view)).toEqual(['Great'])
  })

  it('drops a pick whose write failed and says why', async () => {
    rateDailyNote.mockRejectedValue(new Error('disk full'))
    const { view } = renderPicker('2026-10-26')

    await userEvent.click(view.getByRole('button', { name: 'Okay' }))

    await waitFor(() => expect(failOperation).toHaveBeenCalledWith('disk full'))
    expect(pressed(view)).toEqual([])
  })

  it('clears the rating when the shown one is picked again', async () => {
    getDailyMoods.mockResolvedValue([{ date: '2026-10-26', rating: 2 }])
    const { view } = renderPicker('2026-10-26')
    await waitFor(() => expect(pressed(view)).toEqual(['Bad']))

    await userEvent.click(view.getByRole('button', { name: 'Bad' }))

    expect(rateDailyNote).toHaveBeenCalledWith('daily/2026-10-26.md', null, 1)
    expect(pressed(view)).toEqual([])
  })

  it('follows the index once it reports a newer rating, even one it never saw picked', async () => {
    const { view, client } = renderPicker('2026-10-26')
    await userEvent.click(view.getByRole('button', { name: 'Okay' }))

    // The note was saved and re-indexed; then the line was edited by hand.
    getDailyMoods.mockResolvedValue([{ date: '2026-10-26', rating: 3 }])
    await act(() => client.invalidateQueries({ queryKey: [INDEX_QUERY_SCOPE] }))
    getDailyMoods.mockResolvedValue([{ date: '2026-10-26', rating: 1 }])
    await act(() => client.invalidateQueries({ queryKey: [INDEX_QUERY_SCOPE] }))

    await waitFor(() => expect(pressed(view)).toEqual(['Awful']))
  })

  it('shows the period toggle pressed on a marked day and flips it in one click', async () => {
    getPeriodDays.mockResolvedValue(['2026-10-26'])
    const { view } = renderPicker('2026-10-26')
    const toggle = view.getByRole('button', { name: 'Period' })
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'))

    await userEvent.click(toggle)

    expect(markPeriodDay).toHaveBeenCalledWith('daily/2026-10-26.md', false, 1)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('marks an unmarked day, and drops the flip when the write fails', async () => {
    const { view } = renderPicker('2026-10-20')
    const toggle = view.getByRole('button', { name: 'Period' })

    await userEvent.click(toggle)
    expect(markPeriodDay).toHaveBeenCalledWith('daily/2026-10-20.md', true, 1)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    markPeriodDay.mockRejectedValue(new Error('disk full'))
    await userEvent.click(toggle)
    await waitFor(() => expect(failOperation).toHaveBeenCalledWith('disk full'))
  })

  it('asks about the day, not today, on a past note', () => {
    const { view } = renderPicker('2026-10-20')
    expect(view.getByText('How was this day?')).toBeTruthy()
  })

  it('shows nothing on a day still ahead', () => {
    const { view } = renderPicker('2026-10-27')
    expect(view.queryByRole('group', { name: 'Mood' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Period' })).toBeNull()
  })
})
