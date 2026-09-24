import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { todayIso } from '@/lib/dates'
import {
  FocusedDailyProvider,
  useFocusedDailyDate,
} from '@/providers/focused-daily-provider'
import type { Route } from '@/routing/route'
import { RouterProvider, useRouter } from '@/routing/router'
import { DailyView } from './daily-view'

const paneProps = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))
vi.mock('@/components/note-pane', () => ({
  NotePane: (props: Record<string, unknown>) => {
    paneProps.calls.push(props)
    return <div data-testid="pane-probe" data-path={String(props['path'])} />
  },
}))
vi.mock('@/components/note-pin-button', () => ({
  NotePinButton: ({ path }: { path: string }) => (
    <button type="button" aria-label={`pin ${path}`} />
  ),
}))
vi.mock('@/components/context-sidebar/day-calendar', () => ({
  DayCalendar: ({ selectedDate, onNavigate }: { selectedDate: string; onNavigate?: () => void }) => (
    <div data-testid="calendar-probe" data-selected={selectedDate}>
      <button type="button" onClick={() => onNavigate?.()}>
        probe pick a day
      </button>
    </div>
  ),
}))
const toast = vi.hoisted(() => ({ warning: vi.fn(), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { dateFormat: 'iso' }, updateSettings: () => {} }),
}))

function RouteProbe(): ReactElement {
  const { route, back } = useRouter()
  return (
    <>
      <output data-testid="route">{JSON.stringify(route)}</output>
      <button type="button" onClick={back}>
        history back
      </button>
    </>
  )
}

function shownDay(): string {
  const headings = document.querySelectorAll('.dayjot-daily-subject')
  expect(headings).toHaveLength(1)
  return headings[0]!.textContent ?? ''
}

function FocusProbe(): ReactElement {
  return <output data-testid="focused-day">{useFocusedDailyDate() ?? ''}</output>
}

function ViewForRoute(): ReactElement {
  const { route } = useRouter()
  if (route.kind === 'today') {
    return <DailyView target={{ kind: 'today' }} />
  }
  if (route.kind === 'daily') {
    return <DailyView target={{ kind: 'date', date: route.date }} />
  }
  return <output data-testid="elsewhere" />
}

function renderView(route: Route): RenderResult {
  return render(
    <TooltipProvider>
      <RouterProvider initialRoute={route}>
        <FocusedDailyProvider>
          <ViewForRoute />
          <RouteProbe />
          <FocusProbe />
        </FocusedDailyProvider>
      </RouterProvider>
    </TooltipProvider>,
  )
}

/** Text input reaching the canvas from the day's editor, as the browser reports it. */
function inputIntoNote(inputType = 'insertText'): void {
  fireEvent(
    screen.getAllByTestId('pane-probe')[0]!,
    new InputEvent('beforeinput', { inputType, data: 'x', bubbles: true }),
  )
}

function routed(): unknown {
  return JSON.parse(screen.getByTestId('route').textContent!)
}

beforeEach(() => {
  paneProps.calls.length = 0
  toast.warning.mockClear()
  toast.dismiss.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DailyView', () => {
  it('shows exactly one day — the routed date — and nothing across dates', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    const panes = screen.getAllByTestId('pane-probe')
    expect(panes).toHaveLength(1)
    expect(panes[0]!.getAttribute('data-path')).toBe('daily/2026-06-09.md')
    expect(shownDay()).toBe('2026-06-09')
  })

  it('the today route shows the live local day, pinned at arrival', () => {
    renderView({ kind: 'today' })

    expect(screen.getAllByTestId('pane-probe')[0]!.getAttribute('data-path')).toBe(
      `daily/${todayIso()}.md`,
    )
  })

  it('reports the on-canvas day as the focused day for the sidebar', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    expect(screen.getByTestId('focused-day').textContent).toBe('2026-06-09')
  })

  it('the chevrons navigate to the neighbor days — explicit navigation, no scrolling', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(JSON.parse(screen.getByTestId('route').textContent!)).toEqual({
      kind: 'daily',
      date: '2026-06-10',
    })
    expect(shownDay()).toBe('2026-06-10')

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(JSON.parse(screen.getByTestId('route').textContent!)).toEqual({
      kind: 'daily',
      date: '2026-06-08',
    })
    expect(shownDay()).toBe('2026-06-08')
  })

  it('back re-pins the shown day (history moves change entryId, not arrivalSeq)', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(shownDay()).toBe('2026-06-10')

    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    expect(shownDay()).toBe('2026-06-09')
    expect(screen.getByTestId('focused-day').textContent).toBe('2026-06-09')
  })

  it('stepping onto the live day routes today, keeping the canvas rolling over', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    renderView({ kind: 'daily', date: iso })

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(JSON.parse(screen.getByTestId('route').textContent!)).toEqual({ kind: 'today' })
  })

  it('every arrival focuses the editor once — start for plain arrivals', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    const last = paneProps.calls.at(-1)!
    expect(last['autoFocus']).toBe(true)
    expect(last['autoFocusSelection']).toBe('start')
  })

  it('offers the day pin beside the heading', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    expect(screen.getByRole('button', { name: 'pin daily/2026-06-09.md' })).toBeDefined()
  })

  it('opens a date-picker from the header on the shown day, and closes it on a pick', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    // Hidden until asked for — an icon in the header, not an always-open grid.
    expect(screen.queryByTestId('calendar-probe')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))
    const probe = screen.getByTestId('calendar-probe')
    expect(probe.getAttribute('data-selected')).toBe('2026-06-09')

    fireEvent.click(screen.getByRole('button', { name: 'probe pick a day' }))
    expect(screen.queryByTestId('calendar-probe')).toBeNull()
  })

  it('shows a Today pill on other days that takes the canvas home, and hides it on today', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(JSON.parse(screen.getByTestId('route').textContent!)).toEqual({ kind: 'today' })
    expect(shownDay()).toBe(todayIso())
    // Home again — nothing to escape from, so the pill withdraws.
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
  })

  it('warns above the note on any day but today, with the way home', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('This isn’t today’s note.')
    // Pinned to the top of the canvas's scroll, so it stays in view when scrolled.
    expect(banner.parentElement?.classList).toContain('sticky')
    expect(banner.parentElement?.classList).toContain('top-0')

    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))
    expect(routed()).toEqual({ kind: 'today' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("shows no warning on today's note", () => {
    renderView({ kind: 'today' })

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('pops a warning naming the day the first time the user writes in it — once per visit', () => {
    renderView({ kind: 'daily', date: '2026-06-09' })

    inputIntoNote()
    inputIntoNote('insertFromPaste')
    expect(toast.warning).toHaveBeenCalledOnce()
    expect(toast.warning).toHaveBeenCalledWith(
      'This isn’t today’s note',
      expect.objectContaining({ description: 'You’re writing in 2026-06-09.' }),
    )

    // A new visit (another day) can warn again.
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    inputIntoNote('insertCompositionText')
    expect(toast.warning).toHaveBeenCalledTimes(2)
  })

  it("the warning's action goes to today", () => {
    renderView({ kind: 'daily', date: '2026-06-09' })
    inputIntoNote()

    const [, options] = toast.warning.mock.calls[0]!
    act(() => {
      options.action.onClick()
    })
    expect(routed()).toEqual({ kind: 'today' })
    expect(toast.dismiss).toHaveBeenCalled()
  })

  it("never warns for deleting, or for writing in today's note", () => {
    renderView({ kind: 'daily', date: '2026-06-09' })
    inputIntoNote('deleteContentBackward')
    cleanup()

    renderView({ kind: 'today' })
    inputIntoNote()

    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('flags a day left on screen overnight as soon as the window comes back', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 22, 22, 0, 0))
    renderView({ kind: 'today' })
    expect(screen.queryByRole('alert')).toBeNull()

    vi.setSystemTime(new Date(2026, 8, 23, 9, 0, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    // Still the same day on screen — flagged, not switched.
    expect(shownDay()).toBe('2026-09-22')
    expect(screen.getByRole('alert').textContent).toContain('This isn’t today’s note.')
    inputIntoNote()
    expect(toast.warning).toHaveBeenCalledOnce()
  })
})
