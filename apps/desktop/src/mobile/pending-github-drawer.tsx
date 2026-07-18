import { useState, type ReactElement } from 'react'
import { ConnectGithubDrawer } from '@/mobile/connect-github-drawer'
import { clearPendingGithubSetup, hasPendingGithubSetup } from '@/lib/pending-github-setup'

/**
 * Offers the Connect-GitHub sheet right after the onboarding screen's GitHub
 * path opened the on-device graph — the `pending-github-setup` sessionStorage
 * handoff. The flag is cleared when the sheet closes, connected or dismissed,
 * so it never re-prompts.
 */
export function PendingGithubDrawer(): ReactElement | null {
  const [open, setOpen] = useState(hasPendingGithubSetup)
  if (!open) {
    return null
  }
  return (
    <ConnectGithubDrawer
      open
      onOpenChange={(next) => {
        if (!next) {
          clearPendingGithubSetup()
          setOpen(false)
        }
      }}
    />
  )
}
