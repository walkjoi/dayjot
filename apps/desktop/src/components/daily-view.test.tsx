import { cleanup, fireEvent, render, screen, type RenderResult } from '@testing-library/react'
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

beforeEach(() => {
  paneProps.calls.length = 0
})

afterEach(() => {
  cleanup()
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
})
