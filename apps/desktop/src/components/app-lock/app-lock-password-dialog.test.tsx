import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLockPasswordDialog, type AppLockPasswordIntent } from './app-lock-password-dialog'

const setAppLockPassword = vi.hoisted(() => vi.fn(async () => true))
const removeAppLockPassword = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  setAppLockPassword,
  removeAppLockPassword,
}))

const onClose = vi.fn()
const onDone = vi.fn()

function renderDialog(intent: AppLockPasswordIntent): void {
  render(<AppLockPasswordDialog intent={intent} onClose={onClose} onDone={onDone} />)
}

beforeEach(() => {
  setAppLockPassword.mockReset().mockResolvedValue(true)
  removeAppLockPassword.mockReset().mockResolvedValue(true)
  onClose.mockReset()
  onDone.mockReset()
})

afterEach(cleanup)

describe('AppLockPasswordDialog', () => {
  it('sets a first password without asking for a current one', async () => {
    renderDialog('set')
    expect(screen.queryByLabelText('Current password')).toBeNull()

    await userEvent.type(screen.getByLabelText('New password'), 'hunter2')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'hunter2{Enter}')

    await waitFor(() => expect(setAppLockPassword).toHaveBeenCalledWith(null, 'hunter2'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([' ', 'a', '1'])('accepts %j: anything but empty will do', async (password) => {
    renderDialog('set')

    await userEvent.type(screen.getByLabelText('New password'), password)
    await userEvent.type(screen.getByLabelText('Confirm new password'), `${password}{Enter}`)

    await waitFor(() => expect(setAppLockPassword).toHaveBeenCalledWith(null, password))
  })

  it('rejects an empty password', async () => {
    renderDialog('set')

    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Enter a password.')
    expect(setAppLockPassword).not.toHaveBeenCalled()
  })

  it('rejects a mistyped confirmation', async () => {
    renderDialog('set')

    await userEvent.type(screen.getByLabelText('New password'), 'hunter2')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'hunter3{Enter}')

    expect((await screen.findByRole('alert')).textContent).toBe('The passwords don’t match.')
    expect(setAppLockPassword).not.toHaveBeenCalled()
  })

  it('changes the password after checking the current one', async () => {
    renderDialog('change')

    await userEvent.type(screen.getByLabelText('Current password'), 'old')
    await userEvent.type(screen.getByLabelText('New password'), 'new')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new{Enter}')

    await waitFor(() => expect(setAppLockPassword).toHaveBeenCalledWith('old', 'new'))
  })

  it('stays open on a wrong current password', async () => {
    setAppLockPassword.mockResolvedValue(false)
    renderDialog('change')

    await userEvent.type(screen.getByLabelText('Current password'), 'wrong')
    await userEvent.type(screen.getByLabelText('New password'), 'new')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new{Enter}')

    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect password.')
    expect(onClose).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('removes the password with only the current one', async () => {
    renderDialog('remove')
    expect(screen.queryByLabelText('New password')).toBeNull()

    await userEvent.type(screen.getByLabelText('Current password'), 'old{Enter}')

    await waitFor(() => expect(removeAppLockPassword).toHaveBeenCalledWith('old'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('surfaces a failure instead of closing', async () => {
    setAppLockPassword.mockRejectedValue(new Error('keychain unavailable'))
    renderDialog('set')

    await userEvent.type(screen.getByLabelText('New password'), 'x')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'x{Enter}')

    expect((await screen.findByRole('alert')).textContent).toContain('keychain unavailable')
    expect(onClose).not.toHaveBeenCalled()
  })
})
