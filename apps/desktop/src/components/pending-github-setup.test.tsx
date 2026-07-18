import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphInfo } from '@dayjot/core'
import { hasPendingGithubSetup, markPendingGithubSetup } from '@/lib/pending-github-setup'
import { PendingGithubSetup } from './pending-github-setup'

vi.mock('@/components/settings/connect-github-dialog', () => ({
  ConnectGithubDialog: ({
    suggestedRepoName,
    onClose,
  }: {
    suggestedRepoName: string
    onClose: () => void
  }) => (
    <button type="button" onClick={onClose}>
      wizard suggesting {suggestedRepoName}
    </button>
  ),
}))

const graph: GraphInfo = {
  root: '/Users/alex/Documents/Notes',
  name: 'Notes',
  generation: 1,
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('PendingGithubSetup', () => {
  it('renders nothing without the first-run handoff', () => {
    render(<PendingGithubSetup graph={graph} />)

    expect(screen.queryByText(/wizard suggesting/)).toBeNull()
  })

  it('offers the wizard once after a GitHub-backed create, then clears the flag', () => {
    markPendingGithubSetup()
    render(<PendingGithubSetup graph={graph} />)

    const wizard = screen.getByText(/wizard suggesting/)
    fireEvent.click(wizard)

    expect(screen.queryByText(/wizard suggesting/)).toBeNull()
    expect(hasPendingGithubSetup()).toBe(false)
  })
})
