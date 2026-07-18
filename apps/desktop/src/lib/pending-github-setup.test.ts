import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingGithubSetup,
  hasPendingGithubSetup,
  markPendingGithubSetup,
} from './pending-github-setup'

afterEach(() => {
  window.sessionStorage.clear()
})

describe('pending GitHub setup handoff', () => {
  it('is unset until marked', () => {
    expect(hasPendingGithubSetup()).toBe(false)
  })

  it('marks, reads non-destructively, and clears', () => {
    markPendingGithubSetup()

    // Reading must not consume the flag — a StrictMode remount between the
    // chooser and the workspace would otherwise swallow the wizard prompt.
    expect(hasPendingGithubSetup()).toBe(true)
    expect(hasPendingGithubSetup()).toBe(true)

    clearPendingGithubSetup()
    expect(hasPendingGithubSetup()).toBe(false)
  })
})
