import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DailyWeight } from '@dayjot/core'
import { RouterProvider } from '@/routing/router'
import { WeightChart } from './weight-chart'

// jsdom has no ResizeObserver and measures every box as 0×0; recharts'
// ResponsiveContainer sizes the chart from observer callbacks, so report a
// fixed 320×200 for whatever it observes — enough for a real plot to mount.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe(target: Element): void {
        const contentRect = { width: 320, height: 200, top: 0, left: 0 } as DOMRectReadOnly
        this.callback(
          [{ target, contentRect } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(cleanup)

const TODAY = '2026-08-14'

function entry(date: string, kg: number): DailyWeight {
  return { date, kg, notePath: `daily/${date}.md` }
}

function renderChart(series: DailyWeight[]): ReturnType<typeof render> {
  return render(
    <RouterProvider initialRoute={{ kind: 'stats' }}>
      <WeightChart series={series} today={TODAY} />
    </RouterProvider>,
  )
}

describe('WeightChart', () => {
  it('renders a multi-point series', () => {
    const view = renderChart([
      entry('2026-08-10', 73.2),
      entry('2026-08-12', 72.8),
      entry('2026-08-14', 72.5),
    ])
    expect(view.getByText('72.5 kg')).toBeTruthy()
  })

  it('renders a single-point series without crashing', () => {
    const view = renderChart([entry('2026-08-14', 72.5)])
    expect(view.getByText('Weight')).toBeTruthy()
  })

  it('survives hovering the plot (the tooltip must never throw)', () => {
    const view = renderChart([
      entry('2026-08-10', 73.2),
      entry('2026-08-12', 72.8),
      entry('2026-08-14', 72.5),
    ])
    const surface = view.baseElement.querySelector('.recharts-wrapper')
    expect(surface).not.toBeNull()
    // Sweep across the plot area so the axis tooltip activates at some index.
    for (const clientX of [40, 120, 200, 280]) {
      fireEvent.mouseMove(surface!, { clientX, clientY: 100 })
    }
    fireEvent.mouseLeave(surface!)
  })
})
