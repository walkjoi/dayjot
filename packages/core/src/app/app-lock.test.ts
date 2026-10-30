import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { APP_LOCK_CHANGED_EVENT, setAppLockPassword, subscribeAppLockChanged } from './app-lock'

afterEach(() => {
  setBridge(null)
  vi.restoreAllMocks()
})

describe('subscribeAppLockChanged', () => {
  function installListener() {
    let deliver: (payload: unknown) => void = () => {}
    setBridge({
      invoke: async () => null,
      listen: async (event, handler) => {
        expect(event).toBe(APP_LOCK_CHANGED_EVENT)
        deliver = handler
        return () => {}
      },
    })
    return (payload: unknown) => deliver(payload)
  }

  it('delivers parsed status changes', async () => {
    const deliver = installListener()
    const handler = vi.fn()
    await subscribeAppLockChanged(handler)

    deliver({ locked: true, configured: true })

    expect(handler).toHaveBeenCalledWith({ locked: true, configured: true })
  })

  it('reports contract drift rather than guessing a state', async () => {
    const deliver = installListener()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn()
    await subscribeAppLockChanged(handler)

    deliver({ locked: 'yes' })

    expect(handler).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledOnce()
  })
})

describe('setAppLockPassword', () => {
  it('sends the current and next passwords to the shell', async () => {
    const invoke = vi.fn(async () => true)
    setBridge({ invoke, listen: async () => () => {} })

    await expect(setAppLockPassword('old', 'new')).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith('app_lock_set_password', { current: 'old', next: 'new' })
  })
})
