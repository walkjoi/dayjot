import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasPendingGithubSetup, markPendingGithubSetup } from '@/lib/pending-github-setup'
import { PendingGithubDrawer } from './pending-github-drawer'

vi.mock('@/mobile/connect-github-drawer', () => ({
  ConnectGithubDrawer: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        github sheet
      </button>
    ) : null,
}))

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('PendingGithubDrawer', () => {
  it('renders nothing without the onboarding handoff', () => {
    render(<PendingGithubDrawer />)

    expect(screen.queryByText('github sheet')).toBeNull()
  })

  it('offers the sheet once after the GitHub onboarding path, then clears the flag', () => {
    markPendingGithubSetup()
    render(<PendingGithubDrawer />)

    fireEvent.click(screen.getByText('github sheet'))

    expect(screen.queryByText('github sheet')).toBeNull()
    expect(hasPendingGithubSetup()).toBe(false)
  })
})
