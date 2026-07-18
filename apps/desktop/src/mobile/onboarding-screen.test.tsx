import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileStorageInfo } from '@dayjot/core'
import { hasPendingGithubSetup } from '@/lib/pending-github-setup'
import { MobileOnboardingScreen } from './onboarding-screen'

const completeOnboarding = vi.hoisted(() => vi.fn(async (_kind: string, _root?: string) => {}))
const storageInfo = vi.hoisted<{ current: unknown }>(() => ({ current: null }))
const storageResolving = vi.hoisted<{ current: boolean }>(() => ({ current: false }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({
    mobileStorageInfo: storageInfo.current,
    mobileStorageResolving: storageResolving.current,
    completeOnboarding,
  }),
}))

function setStorage(info: MobileStorageInfo): void {
  storageInfo.current = info
}

beforeEach(() => {
  storageResolving.current = false
  setStorage({
    localRoot: '/Documents',
    icloudDocumentsRoot: '/iCloud/Documents',
    icloudGraphRoots: [],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

describe('MobileOnboardingScreen', () => {
  it('leads with GitHub sync and hands off to the connect sheet', async () => {
    render(<MobileOnboardingScreen />)

    expect(screen.getByRole('heading', { name: 'Start with GitHub sync' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'GitHub sync' })).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith('local'))
    // The shell reads this flag and opens the Connect-GitHub sheet.
    expect(hasPendingGithubSetup()).toBe(true)
  })

  it('drops the connect handoff when the GitHub path fails to open', async () => {
    completeOnboarding.mockRejectedValueOnce(new Error('no space'))
    render(<MobileOnboardingScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))

    await waitFor(() => expect(screen.getByText('no space')).toBeTruthy())
    expect(hasPendingGithubSetup()).toBe(false)
  })

  it('keeps iCloud as the secondary path and creates the named iCloud notes', async () => {
    render(<MobileOnboardingScreen />)

    expect(screen.getByRole('heading', { name: 'iCloud sync' })).toBeTruthy()
    expect(screen.getByLabelText('Graph name')).toHaveProperty('value', 'Notes')
    fireEvent.change(screen.getByLabelText('Graph name'), { target: { value: 'Journal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Setup graph' }))

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledWith('icloud', '/iCloud/Documents/Journal'),
    )
    // Only the GitHub path arms the connect sheet.
    expect(hasPendingGithubSetup()).toBe(false)
  })

  it('lists every container graph while keeping create available', async () => {
    setStorage({
      localRoot: '/Documents',
      icloudDocumentsRoot: '/iCloud/Documents',
      icloudGraphRoots: ['/iCloud/Documents/Notes', '/iCloud/Documents/Work'],
    })
    render(<MobileOnboardingScreen />)

    expect(screen.getByText('We found notes in iCloud Drive. Continue with one, or start fresh.')).toBeTruthy()
    expect(screen.getByText('Start fresh')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Notes' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Setup graph' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Work' }))

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledWith('icloud', '/iCloud/Documents/Work'),
    )
  })

  it('creates a new iCloud graph alongside existing ones', async () => {
    setStorage({
      localRoot: '/Documents',
      icloudDocumentsRoot: '/iCloud/Documents',
      icloudGraphRoots: ['/iCloud/Documents/Notes'],
    })
    render(<MobileOnboardingScreen />)

    fireEvent.change(screen.getByLabelText('Graph name'), { target: { value: 'Journal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Setup graph' }))

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledWith('icloud', '/iCloud/Documents/Journal'),
    )
  })

  it('keeps the on-device choice as a quiet tertiary path', async () => {
    render(<MobileOnboardingScreen />)

    expect(screen.queryByText(/Your notes are plain markdown files/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Or, use this device only' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith('local'))
    // Device-only means no sync — the connect sheet must not follow.
    expect(hasPendingGithubSetup()).toBe(false)
  })

  it('shows the iCloud section as pending while the container resolves', () => {
    // Fresh install: the sandbox root is seeded instantly but the container
    // lookup is still running — the iCloud card must read as loading, not as
    // signed-out, and the create form must wait for the real listing.
    storageResolving.current = true
    setStorage({ localRoot: '/Documents', icloudDocumentsRoot: null, icloudGraphRoots: [] })
    render(<MobileOnboardingScreen />)

    expect(screen.getByRole('heading', { name: 'iCloud sync' })).toBeTruthy()
    expect(screen.getByText('Checking iCloud Drive…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Setup graph' })).toBeNull()
    expect(screen.queryByText(/Sign in to iCloud/)).toBeNull()
    // The GitHub and on-device paths stay live — their root is already known.
    const github = screen.getByRole('button', { name: 'Continue with GitHub' })
    expect((github as HTMLButtonElement).disabled).toBe(false)
    const local = screen.getByRole('button', { name: 'Or, use this device only' })
    expect((local as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the iCloud option visible when iCloud is unavailable', () => {
    setStorage({ localRoot: '/Documents', icloudDocumentsRoot: null, icloudGraphRoots: [] })
    render(<MobileOnboardingScreen />)

    expect(screen.getByRole('heading', { name: 'iCloud sync' })).toBeTruthy()
    expect(
      screen.getByText('Turn on iCloud Drive to keep your notes synced between devices.'),
    ).toBeTruthy()
    expect(
      screen.getByText('Sign in to iCloud on this device, then reopen DayJot.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Or, use this device only' })).toBeTruthy()
  })

  it('does not expose folder language in the primary first-run path', () => {
    render(<MobileOnboardingScreen />)

    expect(screen.queryByText(/folder/i)).toBeNull()
  })
})
