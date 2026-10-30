import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge, type AppLockStatus } from '@dayjot/core'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AppLockProvider, useAppLock } from '@/providers/app-lock-provider'
import { AppLockScreen } from './app-lock-screen'

vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { autoLockMinutes: 30 } }),
}))

const PASSWORD = '晨间 notes'

let status: AppLockStatus
let unlock: (password: string) => boolean
let emit: (payload: unknown) => void
let invoked: string[]
let pendingStatus: Promise<void>

function installBridge(): void {
  invoked = []
  pendingStatus = Promise.resolve()
  setBridge({
    invoke: async (command, args) => {
      invoked.push(command)
      switch (command) {
        case 'app_lock_status':
          await pendingStatus
          return status
        case 'app_lock_unlock': {
          const opened = unlock(String(args['password']))
          if (opened) {
            // The shell's broadcast, not the return value, lifts the screen.
            emit({ locked: false, configured: true })
          }
          return opened
        }
        case 'app_lock_lock':
          return status.configured
        case 'app_lock_set_password':
          status = { locked: false, configured: true }
          return true
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

function RequestLock(): ReactElement {
  const { requestLock } = useAppLock()
  return <button onClick={() => void requestLock()}>Lock</button>
}

function renderScreen(behind?: ReactElement): void {
  render(
    <AppLockProvider>
      <RequestLock />
      {behind}
      <AppLockScreen />
    </AppLockProvider>,
  )
}

function passwordField(): Promise<HTMLElement> {
  return screen.findByLabelText('Password')
}

beforeEach(() => {
  status = { locked: true, configured: true }
  unlock = (password) => password === PASSWORD
  installBridge()
})

afterEach(() => {
  cleanup()
  setBridge(null)
})

describe('AppLockScreen', () => {
  it('covers the window before the shell has answered', async () => {
    let answer: () => void = () => {}
    pendingStatus = new Promise((resolve) => {
      answer = resolve
    })
    const { container } = render(
      <AppLockProvider>
        <AppLockScreen />
      </AppLockProvider>,
    )

    expect(container.querySelector('[aria-hidden]')).not.toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()

    await act(async () => {
      answer()
      await pendingStatus
    })
    await passwordField()
  })

  it('shows nothing while unlocked', async () => {
    status = { locked: false, configured: true }
    const { container } = render(
      <AppLockProvider>
        <AppLockScreen />
      </AppLockProvider>,
    )

    await waitFor(() => expect(container.querySelector('[aria-hidden]')).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names the screen without naming anything from the notes', async () => {
    renderScreen()

    expect(await screen.findByRole('dialog', { name: 'DayJot is locked' })).toBeDefined()
  })

  it('unlocks with the right password', async () => {
    renderScreen()

    await userEvent.type(await passwordField(), `${PASSWORD}{Enter}`)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses the wrong password and clears the field for another try', async () => {
    renderScreen()
    const field = await passwordField()

    await userEvent.type(field, 'nope{Enter}')

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Incorrect password.')
    expect(field).toHaveProperty('value', '')
    expect(screen.getByRole('dialog')).toBeDefined()
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('takes the focus back when the window comes forward', async () => {
    renderScreen()
    const field = await passwordField()
    await waitFor(() => expect(document.activeElement).toBe(field))
    screen.getByRole('dialog').focus()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('never submits an empty password', async () => {
    renderScreen()

    await userEvent.type(await passwordField(), '{Enter}')

    expect(invoked).not.toContain('app_lock_unlock')
  })

  it('reports a failed check, such as a denied keychain prompt', async () => {
    unlock = () => {
      throw { kind: 'io', message: 'User canceled the operation.' }
    }
    renderScreen()

    await userEvent.type(await passwordField(), 'anything{Enter}')

    expect((await screen.findByRole('alert')).textContent).toContain('User canceled')
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('cannot be dismissed with Escape', async () => {
    renderScreen()

    await userEvent.type(await passwordField(), '{Escape}')

    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('offers no context menu, which would reach Inspect Element', async () => {
    renderScreen()

    const unhandled = fireEvent.contextMenu(await passwordField())

    expect(unhandled).toBe(false)
  })

  it('keeps password keystrokes from the document listeners behind it', async () => {
    const listener = vi.fn()
    document.addEventListener('keydown', listener)
    renderScreen()

    await userEvent.type(await passwordField(), 'x')

    document.removeEventListener('keydown', listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('takes the focus from a dialog that was already open, and gives it back', async () => {
    status = { locked: false, configured: true }
    renderScreen(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Behind</DialogTitle>
          <input aria-label="Behind field" />
        </DialogContent>
      </Dialog>,
    )
    const behind = screen.getByLabelText('Behind field')
    await waitFor(() => expect(document.activeElement).toBe(behind))

    act(() => emit({ locked: true, configured: true }))

    const field = await passwordField()
    await waitFor(() => expect(document.activeElement).toBe(field))
    await userEvent.type(field, PASSWORD)
    expect(field).toHaveProperty('value', PASSWORD)

    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByLabelText('Password')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(behind))
  })

  it('locks right after the first password is set from ⌘L', async () => {
    status = { locked: false, configured: false }
    renderScreen()
    await waitFor(() => expect(invoked).toContain('app_lock_status'))

    await userEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await userEvent.type(await screen.findByLabelText('New password'), 'x')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'x{Enter}')

    await waitFor(() => expect(invoked.filter((name) => name === 'app_lock_lock')).toHaveLength(2))
  })
})
