const PENDING_KEY = 'dayjot.pending-github-setup'

/**
 * One-shot handoff between the first-run screens and the open workspace: the
 * graph chooser (desktop) or onboarding screen (mobile) marks the flag right
 * before creating a GitHub-backed graph, and the workspace offers the
 * Connect-GitHub wizard once the graph is open. The flag lives in
 * sessionStorage so an abandoned setup never nags on a later launch, and
 * reading it is non-destructive — it is cleared only when the wizard closes
 * (or the create fails), so a dev-mode remount can't swallow the prompt.
 */
export function markPendingGithubSetup(): void {
  window.sessionStorage.setItem(PENDING_KEY, 'true')
}

/** Whether a GitHub-backed graph was just created and the wizard should open. */
export function hasPendingGithubSetup(): boolean {
  return window.sessionStorage.getItem(PENDING_KEY) === 'true'
}

/** Drop the handoff — the wizard was offered, or the create failed. */
export function clearPendingGithubSetup(): void {
  window.sessionStorage.removeItem(PENDING_KEY)
}
