import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WeightPoint } from './series'
import { WeightTooltip } from './weight-tooltip'

afterEach(cleanup)

const POINT: WeightPoint = {
  date: '2026-08-14',
  kg: 55,
  average: 55.4,
  notePath: 'daily/2026-08-14.md',
  day: 20_679,
}

describe('WeightTooltip', () => {
  it('renders the date and both kg rows, one decimal each', () => {
    const view = render(<WeightTooltip active payload={[{ payload: POINT }]} />)
    expect(view.getByText('Aug 14')).toBeTruthy()
    expect(view.getByText('Weight')).toBeTruthy()
    expect(view.getByText('55.0 kg')).toBeTruthy()
    expect(view.getByText('7-day avg')).toBeTruthy()
    expect(view.getByText('55.4 kg')).toBeTruthy()
  })

  it("never surfaces the scatter's x-axis entry as a row", () => {
    // A Scatter on a numeric axis contributes an extra payload entry for its
    // x value (the UTC day number). Every entry still carries the same data
    // point, so the rendered rows must be identical whichever comes first —
    // and the day number must never appear as a value.
    const view = render(
      <WeightTooltip active payload={[{ payload: POINT }, { payload: POINT }]} />,
    )
    expect(view.queryByText(/20679/)).toBeNull()
    expect(view.getAllByText(/kg$/)).toHaveLength(2)
  })

  it('renders nothing while inactive or without a real point', () => {
    const inactive = render(<WeightTooltip payload={[{ payload: POINT }]} />)
    expect(inactive.container.innerHTML).toBe('')
    const malformed = render(<WeightTooltip active payload={[{ payload: { kg: 55 } }]} />)
    expect(malformed.container.innerHTML).toBe('')
    const empty = render(<WeightTooltip active payload={[]} />)
    expect(empty.container.innerHTML).toBe('')
  })
})
