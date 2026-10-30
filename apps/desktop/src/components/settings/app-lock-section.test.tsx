import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AutoLockMinutes } from '@dayjot/core'
import { AppLockSection } from './app-lock-section'

const appLock = vi.hoisted(() => ({ configured: false }))
vi.mock('@/providers/app-lock-provider', () => ({
  useAppLock: () => appLock,
}))

const settingsState = vi.hoisted(() => ({
  autoLockMinutes: 30 as AutoLockMinutes,
  updateSettings: vi.fn(),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: { autoLockMinutes: settingsState.autoLockMinutes },
    updateSettings: settingsState.updateSettings,
  }),
}))

// jsdom doesn't implement this; Radix Select scrolls the selected option into
// view when the listbox opens.
Element.prototype.scrollIntoView ??= () => {}

function autoLockSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Auto-lock' })
}

beforeEach(() => {
  appLock.configured = false
  settingsState.autoLockMinutes = DEFAULT_SETTINGS.autoLockMinutes
  settingsState.updateSettings.mockClear()
})

afterEach(cleanup)

describe('AppLockSection', () => {
  it('offers to set a password, with the auto-lock waiting on one', () => {
    render(<AppLockSection />)

    expect(screen.getByRole('button', { name: 'Set password' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()
    expect(autoLockSelect()).toHaveProperty('disabled', true)
  })

  it('offers to change or remove a password that exists', () => {
    appLock.configured = true
    render(<AppLockSection />)

    expect(screen.getByRole('button', { name: 'Change password' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Remove password' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Set password' })).toBeNull()
    expect(autoLockSelect()).toHaveProperty('disabled', false)
  })

  it('says the app is what gets covered, not the files', () => {
    render(<AppLockSection />)

    expect(screen.getByText(/stay readable as Markdown files/)).toBeDefined()
  })

  it('opens the dialog for the chosen action', async () => {
    appLock.configured = true
    render(<AppLockSection />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove password' }))

    expect(screen.getByRole('dialog', { name: 'Remove password' })).toBeDefined()
  })

  it('shows the 30-minute default', () => {
    render(<AppLockSection />)

    expect(autoLockSelect().textContent).toBe('30 minutes')
  })

  it.each([
    ['5 minutes', 5],
    ['2 hours', 120],
    ['Never', null],
  ])('saves %s', (label, minutes) => {
    appLock.configured = true
    render(<AppLockSection />)

    fireEvent.click(autoLockSelect())
    fireEvent.click(screen.getByRole('option', { name: label }))

    expect(settingsState.updateSettings).toHaveBeenCalledWith({ autoLockMinutes: minutes })
  })
})
