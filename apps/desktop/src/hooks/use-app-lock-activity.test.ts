import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppLockActivity } from './use-app-lock-activity'

const recordAppActivity = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  recordAppActivity,
}))

function input(type = 'keydown'): void {
  act(() => {
    window.dispatchEvent(new Event(type))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  recordAppActivity.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAppLockActivity', () => {
  it('reports the first input straight away', () => {
    renderHook(() => useAppLockActivity(true))
    input()
    expect(recordAppActivity).toHaveBeenCalledOnce()
  })

  it.each(['keydown', 'pointerdown', 'pointermove', 'wheel'])('counts %s as activity', (type) => {
    renderHook(() => useAppLockActivity(true))
    input(type)
    expect(recordAppActivity).toHaveBeenCalledOnce()
  })

  it('reports a burst of input once per interval', () => {
    renderHook(() => useAppLockActivity(true))
    input()
    input()
    vi.advanceTimersByTime(4_999)
    input()
    expect(recordAppActivity).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(1)
    input()
    expect(recordAppActivity).toHaveBeenCalledTimes(2)
  })

  it('ignores input while disabled', () => {
    renderHook(() => useAppLockActivity(false))
    input()
    expect(recordAppActivity).not.toHaveBeenCalled()
  })

  it('stops listening once disabled', () => {
    const { rerender } = renderHook(({ enabled }) => useAppLockActivity(enabled), {
      initialProps: { enabled: true },
    })
    rerender({ enabled: false })
    input()
    expect(recordAppActivity).not.toHaveBeenCalled()
  })
})
