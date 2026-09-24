import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useToday } from './use-today'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useToday', () => {
  it('rolls over when local midnight passes, then keeps rolling', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 23, 59, 0)) // June 9, 23:59 local
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-06-09')

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000) // past midnight (+ the timer pad)
    })
    expect(result.current).toBe('2026-06-10')

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000) // the timer re-armed
    })
    expect(result.current).toBe('2026-06-11')
  })

  it('re-reads the clock when the window regains focus, past a midnight the timer missed', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 22, 0, 0))
    const { result } = renderHook(() => useToday())

    // The Mac slept through midnight: the clock moved on, the timer never fired.
    vi.setSystemTime(new Date(2026, 5, 10, 8, 30, 0))
    expect(result.current).toBe('2026-06-09')

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe('2026-06-10')
    // Re-armed for the coming midnight, with the stale timer cleared.
    expect(vi.getTimerCount()).toBe(1)
    act(() => {
      vi.advanceTimersByTime(16 * 60 * 60 * 1000)
    })
    expect(result.current).toBe('2026-06-11')
  })

  it('re-reads the clock when the page becomes visible, not when it hides', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    vi.setSystemTime(new Date(2026, 5, 9, 22, 0, 0))
    const { result } = renderHook(() => useToday())
    vi.setSystemTime(new Date(2026, 5, 10, 8, 30, 0))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-06-09')

    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-06-10')
    visibility.mockRestore()
  })

  it('cleans its timer and resume listeners up on unmount', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0))
    const { unmount } = renderHook(() => useToday())
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    window.dispatchEvent(new Event('focus'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
