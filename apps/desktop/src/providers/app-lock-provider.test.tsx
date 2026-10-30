import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge, type AppLockStatus } from '@dayjot/core'
import { AppLockProvider, useAppLock } from './app-lock-provider'

const settings = vi.hoisted(() => ({ autoLockMinutes: 30 as number | null }))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings }),
}))

const isMainWindow = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/lib/windows/window-role', () => ({ isMainWindow }))

let status: AppLockStatus
let invoked: Array<[string, Record<string, unknown>]>
let emit: (payload: unknown) => void

function installBridge(overrides: Partial<Record<string, () => unknown>> = {}): void {
  invoked = []
  setBridge({
    invoke: async (command, args) => {
      invoked.push([command, args])
      const override = overrides[command]
      if (override !== undefined) {
        return override()
      }
      switch (command) {
        case 'app_lock_status':
          return status
        case 'app_lock_lock':
          return status.configured
        default:
          return null
      }
    },
    listen: async (_event, handler) => {
      emit = handler
      return () => {}
    },
  })
}

function wrapper({ children }: { children: ReactNode }): ReactElement {
  return <AppLockProvider>{children}</AppLockProvider>
}

function commandsNamed(name: string): Array<Record<string, unknown>> {
  return invoked.filter(([command]) => command === name).map(([, args]) => args)
}

beforeEach(() => {
  status = { locked: false, configured: true }
  settings.autoLockMinutes = 30
  isMainWindow.mockReturnValue(true)
  installBridge()
})

afterEach(() => {
  cleanup()
  setBridge(null)
  vi.restoreAllMocks()
})

describe('AppLockProvider', () => {
  it('holds pending until the shell answers, then mirrors it', async () => {
    status = { locked: true, configured: true }
    const { result } = renderHook(() => useAppLock(), { wrapper })

    expect(result.current.phase).toBe('pending')

    await waitFor(() => expect(result.current.phase).toBe('locked'))
    expect(result.current.configured).toBe(true)
  })

  it('follows changes from any window', async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('unlocked'))

    act(() => emit({ locked: true, configured: true }))

    expect(result.current.phase).toBe('locked')
  })

  it('fails closed when the state can’t be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installBridge({
      app_lock_status: () => {
        throw new Error('no answer')
      },
    })
    const { result } = renderHook(() => useAppLock(), { wrapper })

    await waitFor(() => expect(result.current.phase).toBe('locked'))
  })

  it('is unlocked without a shell', () => {
    setBridge(null)
    const { result } = renderHook(() => useAppLock(), { wrapper })

    expect(result.current.phase).toBe('unlocked')
    expect(result.current.configured).toBe(false)
  })

  it('hands the shell the auto-lock delay, and any change to it', async () => {
    const { rerender } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() =>
      expect(commandsNamed('app_lock_set_idle_timeout')).toEqual([{ minutes: 30 }]),
    )

    settings.autoLockMinutes = null
    rerender()

    await waitFor(() =>
      expect(commandsNamed('app_lock_set_idle_timeout')).toEqual([
        { minutes: 30 },
        { minutes: null },
      ]),
    )
  })

  it('leaves the auto-lock delay to the main window', async () => {
    isMainWindow.mockReturnValue(false)
    const { result } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('unlocked'))

    expect(commandsNamed('app_lock_set_idle_timeout')).toEqual([])
  })

  it('counts input only while unlocked with a password', async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('unlocked'))

    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    expect(commandsNamed('app_lock_record_activity')).toHaveLength(1)

    act(() => emit({ locked: true, configured: true }))
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    expect(commandsNamed('app_lock_record_activity')).toHaveLength(1)
  })

  it('locks on request', async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('unlocked'))

    await act(() => result.current.requestLock())

    expect(commandsNamed('app_lock_lock')).toHaveLength(1)
    expect(result.current.setupOpen).toBe(false)
  })

  it('offers to set a password when locking has nothing to lock with', async () => {
    status = { locked: false, configured: false }
    const { result } = renderHook(() => useAppLock(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('unlocked'))

    await act(() => result.current.requestLock())
    expect(result.current.setupOpen).toBe(true)

    act(() => result.current.closeSetup())
    expect(result.current.setupOpen).toBe(false)
  })
})
