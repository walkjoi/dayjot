import { cleanup, fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { DailyMood } from '@dayjot/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RouterProvider, useRouter } from '@/routing/router'
import { YearInPixels } from './year-in-pixels'

vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: { dateFormat: 'iso' },
    updateSettings: () => {},
  }),
}))

function RouteProbe(): ReactNode {
  const { route } = useRouter()
  return <output data-testid="route">{JSON.stringify(route)}</output>
}

function renderPixels(moods: DailyMood[], periodDays: string[] = [], today = '2026-10-26') {
  return render(
    <TooltipProvider>
      <RouterProvider initialRoute={{ kind: 'stats' }}>
        <YearInPixels moods={moods} periodDays={periodDays} today={today} />
        <RouteProbe />
      </RouterProvider>
    </TooltipProvider>,
  )
}

function cell(view: ReturnType<typeof renderPixels>, date: string): HTMLElement {
  const found = view.container.querySelector<HTMLElement>(`[data-date="${date}"]`)
  if (found === null) {
    throw new Error(`no pixel for ${date}`)
  }
  return found
}

afterEach(cleanup)

describe('YearInPixels', () => {
  it("lays out every real day of today's year and names each by its rating", () => {
    const view = renderPixels([
      { date: '2026-10-25', rating: 5 },
      { date: '2026-10-26', rating: 2 },
    ])

    expect(view.getAllByRole('gridcell')).toHaveLength(365)
    expect(view.container.querySelector('[data-date="2026-02-29"]')).toBeNull()
    expect(cell(view, '2026-10-25').getAttribute('aria-label')).toBe('2026-10-25: Great')
    expect(cell(view, '2026-10-26').getAttribute('aria-label')).toBe('2026-10-26: Bad')
    expect(cell(view, '2026-10-24').getAttribute('aria-label')).toBe('2026-10-24: Not rated')
    expect(cell(view, '2026-10-26').getAttribute('aria-current')).toBe('date')
    expect(view.getByText('2 days rated')).toBeTruthy()
  })

  it('is one tab stop, starting on today, that arrow keys move through', async () => {
    const view = renderPixels([{ date: '2026-10-26', rating: 4 }])

    const stops = view.getAllByRole('gridcell').filter((pixel) => pixel.tabIndex === 0)
    expect(stops.map((pixel) => pixel.dataset['date'])).toEqual(['2026-10-26'])

    cell(view, '2026-10-26').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(cell(view, '2026-09-26'))
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement).toBe(cell(view, '2026-09-30'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cell(view, '2026-10-01'))
    expect(cell(view, '2026-10-01').tabIndex).toBe(0)
    expect(cell(view, '2026-10-26').tabIndex).toBe(-1)
  })

  it("opens a day's note on click and on Enter", async () => {
    const view = renderPixels([{ date: '2026-10-26', rating: 4 }])

    await userEvent.click(cell(view, '2026-03-14'))
    expect(view.getByTestId('route').textContent).toBe('{"kind":"daily","date":"2026-03-14"}')

    cell(view, '2026-10-25').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(view.getByTestId('route').textContent).toBe('{"kind":"daily","date":"2026-10-25"}')
  })

  it('dots period days and names them, with a legend and count of their own', () => {
    const view = renderPixels(
      [{ date: '2026-10-25', rating: 3 }],
      ['2026-10-24', '2026-10-25', '2025-12-30'],
    )

    expect(cell(view, '2026-10-25').getAttribute('aria-label')).toBe('2026-10-25: Okay, period day')
    expect(cell(view, '2026-10-24').getAttribute('aria-label')).toBe(
      '2026-10-24: Not rated, period day',
    )
    expect(cell(view, '2026-10-24').querySelector('span')).not.toBeNull()
    expect(cell(view, '2026-10-23').querySelector('span')).toBeNull()
    expect(view.getByText('1 day rated · 2 period days')).toBeTruthy()
    expect(view.getByText('Period')).toBeTruthy()
    // A marked day in an earlier year makes that year reachable.
    expect(view.getByRole('button', { name: 'Previous year' })).toHaveProperty('disabled', false)
  })

  it('shows only the period half when no day was ever rated', () => {
    const view = renderPixels([], ['2026-10-24'])
    expect(view.getByText('1 period day')).toBeTruthy()
    expect(view.queryByText('Not rated')).toBeNull()
    expect(view.queryByText('Awful')).toBeNull()
  })

  it('steps back to earlier rated years and stops at the ends', async () => {
    const view = renderPixels([
      { date: '2025-12-31', rating: 3 },
      { date: '2026-01-01', rating: 4 },
    ])

    const previous = view.getByRole('button', { name: 'Previous year' })
    const next = view.getByRole('button', { name: 'Next year' })
    expect(next).toHaveProperty('disabled', true)

    await userEvent.click(previous)
    expect(view.getByText('2025')).toBeTruthy()
    expect(cell(view, '2025-12-31').getAttribute('aria-label')).toBe('2025-12-31: Okay')
    expect(view.getByText('1 day rated')).toBeTruthy()
    expect(previous).toHaveProperty('disabled', true)
    // Away from today's year, the tab stop starts the year.
    expect(cell(view, '2025-01-01').tabIndex).toBe(0)
  })
})
