import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatDayLabel } from '@/lib/dates'
import { monthLabel } from '@/lib/month-grid'
import type { NoteRoute } from '@/routing/route'
import { RouterProvider, useRouter } from '@/routing/router'
import { DayCalendar } from './day-calendar'

const dailyDatesInRange = vi.hoisted(() => vi.fn())
const openRouteInNewWindow = vi.hoisted(() =>
  vi.fn<(route: NoteRoute) => Promise<boolean>>(),
)
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  hasBridge: () => true,
  dailyDatesInRange,
}))
vi.mock('@/lib/windows/open-in-new-window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/windows/open-in-new-window')>()),
  openRouteInNewWindow,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: { dateFormat: 'mdy', weekStartDay: 'monday' },
    updateSettings: () => {},
  }),
}))

function RouteProbe(): ReactNode {
  const { route } = useRouter()
  return <output data-testid="route">{JSON.stringify(route)}</output>
}

function renderCalendar(selectedDate: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <TooltipProvider>
      <QueryClientProvider client={client}>
        <RouterProvider>
          <DayCalendar selectedDate={selectedDate} today="2026-06-15" />
          <RouteProbe />
        </RouterProvider>
      </QueryClientProvider>
    </TooltipProvider>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  dailyDatesInRange.mockReset().mockResolvedValue([])
  openRouteInNewWindow.mockReset().mockResolvedValue(true)
})

afterEach(cleanup)

describe('DayCalendar', () => {
  it('jumps to today from the calendar-icon button', async () => {
    const view = renderCalendar('2026-06-09')
    await userEvent.click(view.getByRole('button', { name: 'Jump to today' }))
    expect(view.getByTestId('route').textContent).toContain('"kind":"today"')
    view.unmount()
  })

  it('marks days that have a daily note and navigates on day click', async () => {
    dailyDatesInRange.mockResolvedValue(['2026-06-05'])
    const view = renderCalendar('2026-06-09')

    await view.findByTestId('note-dot-2026-06-05')
    expect(dailyDatesInRange).toHaveBeenCalledWith('2026-06-01', '2026-07-05')
    expect(view.queryByTestId('note-dot-2026-06-04')).toBeNull()

    await userEvent.click(view.getByRole('button', { name: formatDayLabel('2026-06-18', 'mdy') }))
    expect(view.getByTestId('route').textContent).toContain('2026-06-18')
    view.unmount()
  })

  it('modifier-click opens a day in a new window without moving the current window', async () => {
    const view = renderCalendar('2026-06-09')
    const day = view.getByRole('button', { name: formatDayLabel('2026-06-18', 'mdy') })

    fireEvent.click(day, { metaKey: true })

    await waitFor(() =>
      expect(openRouteInNewWindow).toHaveBeenCalledWith({
        kind: 'daily',
        date: '2026-06-18',
      }),
    )
    expect(openRouteInNewWindow).toHaveBeenCalledTimes(1)
    expect(view.getByTestId('route').textContent).toBe(JSON.stringify({ kind: 'today' }))
    view.unmount()
  })

  it('does not fall back after the calendar scope moves to another selected day', async () => {
    let finishOpen: (opened: boolean) => void = () => {}
    openRouteInNewWindow.mockReturnValue(
      new Promise((resolve) => {
        finishOpen = resolve
      }),
    )
    const view = renderCalendar('2026-06-09')
    const day = view.getByRole('button', { name: formatDayLabel('2026-06-18', 'mdy') })

    fireEvent.click(day, { metaKey: true })
    await waitFor(() => expect(openRouteInNewWindow).toHaveBeenCalledTimes(1))
    view.rerender(
      <TooltipProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <RouterProvider>
            <DayCalendar selectedDate="2026-06-10" today="2026-06-15" />
            <RouteProbe />
          </RouterProvider>
        </QueryClientProvider>
      </TooltipProvider>,
    )

    await act(async () => {
      finishOpen(false)
    })

    expect(view.getByTestId('route').textContent).toBe(JSON.stringify({ kind: 'today' }))
    view.unmount()
  })

  it('pages between months across year boundaries', async () => {
    const view = renderCalendar('2026-01-15')
    expect(view.getByText(monthLabel('2026-01'))).toBeDefined()
    await userEvent.click(view.getByRole('button', { name: 'Previous month' }))
    expect(view.getByText(monthLabel('2025-12'))).toBeDefined()
    await userEvent.click(view.getByRole('button', { name: 'Next month' }))
    await userEvent.click(view.getByRole('button', { name: 'Next month' }))
    expect(view.getByText(monthLabel('2026-02'))).toBeDefined()
    view.unmount()
  })

  it('re-anchors the visible month when the selected day changes', () => {
    const view = renderCalendar('2026-06-09')
    expect(view.getByText(monthLabel('2026-06'))).toBeDefined()
    view.rerender(
      <TooltipProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <RouterProvider>
            <DayCalendar selectedDate="2026-09-01" today="2026-06-15" />
            <RouteProbe />
          </RouterProvider>
        </QueryClientProvider>
      </TooltipProvider>,
    )
    expect(view.getByText(monthLabel('2026-09'))).toBeDefined()
    view.unmount()
  })
})
