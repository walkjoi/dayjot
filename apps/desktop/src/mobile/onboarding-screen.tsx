import { useState, type ReactElement } from 'react'
import { FolderGit2, HardDrive } from 'lucide-react'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAsyncAction } from '@/hooks/use-async-action'
import { clearPendingGithubSetup, markPendingGithubSetup } from '@/lib/pending-github-setup'
import { OnboardingIcloudHeader } from '@/mobile/onboarding-icloud-header'
import { OnboardingIcloudSection } from '@/mobile/onboarding-icloud-section'
import { useGraph } from '@/providers/graph-provider'

/** Which control kicked off the in-flight choice, so only that one shows the
 * spinner/pending label (every button still disables). Container graph roots
 * are absolute paths, so the fixed tags can never collide with one. */
type PendingChoice = string | 'github' | 'icloud-create' | 'local' | null

/**
 * The mobile first-run screen (Plans 19/21) — shown until the user picks
 * where their notes live, gated by the `mobileOnboarded` setting in
 * {@link GraphProvider}.
 *
 * GitHub sync leads: notes live on this device and sync everywhere through a
 * private Git repository, so the hero block opens the on-device graph and
 * marks the `pending-github-setup` handoff — the shell offers the
 * Connect-GitHub sheet once the notes are on screen (auth needs the full app
 * shell, not this pre-graph screen). iCloud Drive follows as the zero-config
 * Apple path ({@link OnboardingIcloudSection}), and **use this device only**
 * opens the app-sandbox root with no sync at all. Every path ends in
 * `completeOnboarding(kind, root)`, which opens the chosen root and records
 * the flag + storage kind + graph name.
 *
 * The screen renders before the iCloud container has resolved (the boot no
 * longer waits on it — see `useMobileGraphBoot`): while
 * `mobileStorageResolving` is set the iCloud card shows a pending row
 * instead of vanishing, since a null container root only means "signed out"
 * once the lookup finished.
 */
export function MobileOnboardingScreen(): ReactElement {
  const { mobileStorageInfo, mobileStorageResolving, completeOnboarding } = useGraph()
  const action = useAsyncAction()
  const [pendingChoice, setPendingChoice] = useState<PendingChoice>(null)

  const icloudDocumentsRoot = mobileStorageInfo?.icloudDocumentsRoot ?? null
  const icloudReady = icloudDocumentsRoot !== null
  // While the container is still resolving, the section renders in a pending
  // state instead of vanishing — "no iCloud" is only honest once known.
  const icloudPending = !icloudReady && mobileStorageResolving
  const icloudGraphs = mobileStorageInfo?.icloudGraphRoots ?? []

  function runChoice(choice: Exclude<PendingChoice, null>, task: () => Promise<void>): void {
    setPendingChoice(choice)
    void action.run(task).finally(() => setPendingChoice(null))
  }

  return (
    <div
      className="flex min-h-dvh w-screen overflow-auto bg-surface-app px-5 text-text"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 1.5rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)',
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 py-6">
        <header className="flex flex-col gap-4 pt-2">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderGit2 aria-hidden className="size-5" strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Start with GitHub sync
            </h1>
            <p className="text-sm leading-6 text-text-secondary">
              Keep notes on this iPhone and sync them everywhere through a private GitHub
              repository.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-4">
          <OnboardingGithubSection
            busy={action.pending || mobileStorageInfo === null}
            pending={pendingChoice === 'github'}
            onContinue={() =>
              runChoice('github', async () => {
                // Marked before completeOnboarding: a successful open swaps
                // this screen for the shell, which reads the flag. A failed
                // open clears it so the sheet can't appear over a retry.
                markPendingGithubSetup()
                try {
                  await completeOnboarding('local')
                } catch (err) {
                  clearPendingGithubSetup()
                  throw err
                }
              })
            }
          />

          {icloudReady || icloudPending ? (
            <OnboardingIcloudSection
              pending={icloudPending}
              documentsRoot={icloudDocumentsRoot}
              graphs={icloudGraphs}
              busy={action.pending}
              pendingChoice={pendingChoice}
              onOpen={(root) => runChoice(root, () => completeOnboarding('icloud', root))}
              onCreate={(root) =>
                runChoice('icloud-create', () => completeOnboarding('icloud', root))
              }
            />
          ) : (
            <IcloudUnavailableSection />
          )}

          <div className="flex flex-col items-center gap-1 px-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-text-secondary"
              onClick={() => runChoice('local', () => completeOnboarding('local'))}
              disabled={action.pending || mobileStorageInfo === null}
            >
              {pendingChoice === 'local' ? (
                <Spinner />
              ) : (
                <HardDrive aria-hidden strokeWidth={1.75} />
              )}
              {pendingChoice === 'local' ? 'Setting up…' : 'Or, use this device only'}
            </Button>
          </div>
        </div>

        {action.error !== null ? <InlineAlert tone="error">{action.error}</InlineAlert> : null}
      </div>
    </div>
  )
}

/**
 * The hero card: an on-device graph synced through GitHub. Only opens the
 * graph — the Connect-GitHub sheet follows in the shell via the
 * `pending-github-setup` handoff.
 */
function OnboardingGithubSection({
  busy,
  pending,
  onContinue,
}: {
  busy: boolean
  pending: boolean
  onContinue: () => void
}): ReactElement {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FolderGit2 aria-hidden className="size-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">GitHub sync</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Recommended
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Notes stay on this iPhone and sync through a private GitHub repository you control.
          </p>
        </div>
      </div>
      <Button type="button" className="w-full" disabled={busy} onClick={onContinue}>
        {pending ? <Spinner /> : <FolderGit2 aria-hidden strokeWidth={1.75} />}
        {pending ? 'Setting up…' : 'Continue with GitHub'}
      </Button>
      <p className="text-center text-xs text-text-muted">
        You’ll sign in to GitHub once your notes open.
      </p>
    </section>
  )
}

function IcloudUnavailableSection(): ReactElement {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <OnboardingIcloudHeader description="Turn on iCloud Drive to keep your notes synced between devices." />
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-text-muted">
        Sign in to iCloud on this device, then reopen DayJot.
      </p>
    </section>
  )
}
