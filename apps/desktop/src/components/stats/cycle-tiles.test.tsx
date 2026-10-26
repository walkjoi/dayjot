import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CycleTiles } from './cycle-tiles'

afterEach(cleanup)

function tile(view: ReturnType<typeof render>, label: string): { value: string; detail: string } {
  const value = view.getByText(label).nextSibling
  return { value: value?.textContent ?? '', detail: value?.nextSibling?.textContent ?? '' }
}

describe('CycleTiles', () => {
  it('reports the cycle day, the average cycle, and the last period', () => {
    const view = render(
      <CycleTiles
        periodDays={['2026-08-31', '2026-09-01', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-26']}
        today="2026-10-30"
      />,
    )
    expect(tile(view, 'Cycle day')).toEqual({ value: '5', detail: 'since Oct 26' })
    expect(tile(view, 'Average cycle')).toEqual({ value: '28', detail: 'days · last 2 cycles' })
    expect(tile(view, 'Last period')).toEqual({ value: '1', detail: 'day · Oct 26' })
  })

  it('waits for a second period before averaging', () => {
    const view = render(<CycleTiles periodDays={['2026-10-20', '2026-10-21']} today="2026-10-26" />)
    expect(tile(view, 'Average cycle')).toEqual({ value: '—', detail: 'after two periods' })
    expect(tile(view, 'Last period')).toEqual({ value: '2', detail: 'days · Oct 20–Oct 21' })
  })

  it('stops counting the cycle day when the last period is long past', () => {
    const view = render(<CycleTiles periodDays={['2026-06-01']} today="2026-10-26" />)
    expect(tile(view, 'Cycle day')).toEqual({ value: '—', detail: 'last began Jun 1' })
  })
})
