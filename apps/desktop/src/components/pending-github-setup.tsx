import { useState, type ReactElement } from 'react'
import type { GraphInfo } from '@dayjot/core'
import { ConnectGithubDialog } from '@/components/settings/connect-github-dialog'
import { suggestRepoName } from '@/lib/github-repos'
import { clearPendingGithubSetup, hasPendingGithubSetup } from '@/lib/pending-github-setup'

interface PendingGithubSetupProps {
  graph: GraphInfo
}

/**
 * Offers the Connect-GitHub wizard right after the first-run chooser (or the
 * mobile onboarding screen) created a GitHub-backed graph — the
 * `pending-github-setup` sessionStorage handoff. The flag is cleared when the
 * wizard closes, connected or dismissed, so it never re-prompts; reading it
 * at mount is non-destructive so a dev-mode remount can't swallow the prompt.
 */
export function PendingGithubSetup({ graph }: PendingGithubSetupProps): ReactElement | null {
  const [open, setOpen] = useState(hasPendingGithubSetup)
  if (!open) {
    return null
  }
  return (
    <ConnectGithubDialog
      suggestedRepoName={suggestRepoName(graph.name)}
      onClose={() => {
        clearPendingGithubSetup()
        setOpen(false)
      }}
    />
  )
}
