import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { documentDir } from '@tauri-apps/api/path'
import { errorMessage, hasBridge, icloudStatus } from '@dayjot/core'
import { Cloud, Folder, FolderGit2, FolderPlus } from 'lucide-react'
import { InlineAlert } from '@/components/inline-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useGraphColors } from '@/hooks/use-graph-colors'
import { cleanGraphName, graphNameFromRoot, graphRootForName, isGraphNameTaken } from '@/lib/graph-names'
import { markPendingGithubSetup, clearPendingGithubSetup } from '@/lib/pending-github-setup'
import { ICLOUD_STATUS_QUERY_KEY } from '@/lib/query-client'
import { graphColorCss } from '@/lib/graph-colors'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'

/** iCloud is a real option only in the macOS shell. */
function isIcloudCapablePlatform(): boolean {
  return import.meta.env.TAURI_ENV_PLATFORM === 'darwin'
}

/**
 * First-run / no-graph screen (Plan 21 UX pass). One decision, stated
 * plainly: where do your notes live? GitHub sync is the recommended default —
 * a name field creates the graph in Documents and the workspace offers the
 * Connect-GitHub wizard right after it opens (the
 * {@link markPendingGithubSetup} handoff). iCloud remains the zero-config
 * Apple path on macOS, and choosing a folder yourself is the self-managed
 * fallback below the cards.
 *
 * The iCloud card uses "graph" only where the user is deciding between
 * existing containers and creating another one; the folder row talks about
 * folders.
 */
export function GraphChooser(): ReactElement {
  const { recents, error, pickAndOpen, openRecent, createAt, forget } = useGraph()
  const { colorFor } = useGraphColors()
  const icloudCapable = isIcloudCapablePlatform()

  return (
    <ChooserShell>
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Welcome to DayJot</h1>
        <p className="text-sm text-text-secondary">
          Your notes are plain markdown files. Choose where to keep them.
        </p>
      </div>

      <div
        className={cn(
          'grid items-stretch gap-4',
          icloudCapable ? 'sm:grid-cols-2' : 'mx-auto max-w-sm',
        )}
      >
        <GithubCard createAt={createAt} />

        {icloudCapable ? <IcloudCard openRecent={openRecent} createAt={createAt} /> : null}
      </div>

      {/* The self-managed path: any folder, synced however the user likes. */}
      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-text-secondary"
          onClick={() => void pickAndOpen()}
        >
          <FolderPlus aria-hidden strokeWidth={1.75} />
          Or choose a folder on this {icloudCapable ? 'Mac' : 'computer'}…
        </Button>
      </div>

      {error ? (
        <InlineAlert tone="error" className="mx-auto w-full max-w-sm text-center">
          {error}
        </InlineAlert>
      ) : null}

      {recents.length > 0 ? (
        <div className="mx-auto w-full max-w-sm space-y-2">
          <p className="px-2 text-2xs font-medium tracking-wide text-text-muted">Recent</p>
          <ul className="space-y-px">
            {recents.map((recent) => {
              const color = colorFor(recent.root)
              return (
                <li
                  key={recent.root}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-surface-hover"
                >
                  <button
                    type="button"
                    onClick={() => void openRecent(recent.root)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Folder
                      aria-hidden
                      strokeWidth={1.75}
                      className={cn('size-4 shrink-0', color === undefined && 'text-text-muted')}
                      style={color === undefined ? undefined : { color: graphColorCss(color) }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">
                        {recent.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">{recent.root}</span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void forget(recent.root)}
                    aria-label={`Forget ${recent.name}`}
                    className="shrink-0 text-text-muted opacity-0 transition-opacity duration-100 hover:text-text-secondary group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                  >
                    Forget
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </ChooserShell>
  )
}

function ChooserShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex h-screen w-screen overflow-auto bg-surface-app p-8">
      {/* Auto margins (not items-center) so the content centers when it fits but
          scrolls from the top when the recents list outgrows the viewport —
          flex centering would clip the overflowing top edge. */}
      <div className="m-auto w-full max-w-2xl space-y-8">{children}</div>
    </div>
  )
}

/**
 * The icon-chip card header shared by both storage cards — the same visual
 * language as the mobile onboarding screen. A primary-tinted chip marks the
 * recommended path; the neutral chip is the default.
 */
function CardHeader({
  icon,
  title,
  badge,
  tinted = false,
  children,
}: {
  icon: ReactNode
  title: string
  badge?: ReactNode
  tinted?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tinted ? 'bg-primary/10 text-primary' : 'bg-muted text-text-secondary',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {badge}
        </div>
        <p className="text-sm text-text-secondary">{children}</p>
      </div>
    </div>
  )
}

/**
 * The recommended path: a local graph in `Documents/<Name>`, synced through a
 * private GitHub repository. The card only creates the graph —
 * {@link markPendingGithubSetup} hands off to the workspace, which opens the
 * Connect-GitHub wizard once the notes are on screen (auth needs the full
 * app shell, not this pre-graph screen).
 */
function GithubCard({
  createAt,
}: {
  createAt: (root: string) => Promise<boolean>
}): ReactElement {
  const [typedName, setTypedName] = useState('Notes')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const nameId = useId()
  const cleanName = cleanGraphName(typedName)

  async function create(): Promise<void> {
    if (cleanName === null || busy) {
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      const documents = (await documentDir()).replace(/\/+$/, '')
      // Marked before createAt: a successful open unmounts this screen, so
      // the flag must already be set for the workspace to pick up.
      markPendingGithubSetup()
      const opened = await createAt(graphRootForName(documents, cleanName))
      if (!opened) {
        clearPendingGithubSetup()
      }
    } catch (err) {
      clearPendingGithubSetup()
      setLocalError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="GitHub sync"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <CardHeader
        icon={<FolderGit2 aria-hidden className="size-4" strokeWidth={1.75} />}
        title="GitHub sync"
        badge={<Badge variant="secondary">Recommended</Badge>}
        tinted
      >
        Notes live in Documents and sync through a private GitHub repository you control.
      </CardHeader>
      <div className="mt-auto space-y-2">
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="text-xs font-medium text-text-secondary">
            Name
          </label>
          <Input
            id={nameId}
            value={typedName}
            disabled={busy}
            onChange={(event) => setTypedName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void create()
              }
            }}
          />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={busy || cleanName === null}
          onClick={() => void create()}
        >
          {busy ? <Spinner /> : <FolderGit2 aria-hidden strokeWidth={1.75} />}
          {busy ? 'Setting up…' : 'Create'}
        </Button>
        <p className="text-center text-xs text-text-muted">
          You’ll sign in to GitHub once your notes open.
        </p>
        {localError !== null ? <p className="text-xs text-destructive">{localError}</p> : null}
      </div>
    </section>
  )
}

/** What the iCloud card is busy doing: opening one listed graph (its root) or
 * creating a new one — so only the pressed control shows the spinner. Roots
 * are absolute paths, so `'create'` can never collide with one. */
type IcloudBusy = string | 'create' | null

/**
 * The zero-config Apple path. Lists every graph already in the container (a
 * user can keep several) with one-click Open, plus a name field to create a
 * new one; with no container (signed out / unentitled build) the copy is
 * honest and the action disabled. iCloud graphs sync through the container —
 * a Git remote and iCloud are mutually exclusive per graph.
 */
function IcloudCard({
  openRecent,
  createAt,
}: {
  openRecent: (root: string) => Promise<boolean>
  createAt: (root: string) => Promise<boolean>
}): ReactElement {
  const [typedName, setTypedName] = useState<string | null>(null)
  const [busy, setBusy] = useState<IcloudBusy>(null)
  const nameId = useId()
  const { data: status } = useQuery({
    queryKey: ICLOUD_STATUS_QUERY_KEY,
    queryFn: icloudStatus,
    enabled: hasBridge(),
  })

  const pending = busy !== null
  const available = status?.available === true
  const existing = status?.existingGraphRoots ?? []
  // "Notes" pre-fills only the fresh-container form. Next to an existing
  // list the row starts empty — a prefilled default would collide with the
  // usual first graph ("Notes") and paint the screen invalid before the
  // user touched it.
  const name = typedName ?? (existing.length > 0 ? '' : 'Notes')
  const cleanName = cleanGraphName(name)
  // macOS folder names are case-insensitive — a same-named create would
  // land inside the existing graph instead of next to it.
  const nameTaken = cleanName !== null && isGraphNameTaken(cleanName, existing)

  async function create(): Promise<void> {
    if (status?.documentsRoot == null || cleanName === null || nameTaken) {
      return
    }
    setBusy('create')
    try {
      await createAt(`${status.documentsRoot}/${cleanName}`)
    } finally {
      setBusy(null)
    }
  }

  function open(root: string): void {
    setBusy(root)
    void openRecent(root).finally(() => setBusy(null))
  }

  return (
    <section
      aria-label="iCloud"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <CardHeader
        icon={<Cloud aria-hidden className="size-4" strokeWidth={1.75} />}
        title="iCloud"
      >
        {existing.length > 0
          ? 'Open an existing graph from iCloud Drive.'
          : available
            ? 'Syncs across your Mac and iPhone through iCloud Drive.'
            : status === undefined
              ? 'Checking iCloud…'
              : 'Sign in to iCloud on this Mac to sync your notes across devices.'}
      </CardHeader>
      {existing.length > 0 ? (
        <ul className="space-y-1.5">
          {existing.map((root) => (
            <li key={root}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={pending}
                onClick={() => open(root)}
              >
                {busy === root ? (
                  <Spinner />
                ) : (
                  <Cloud aria-hidden strokeWidth={1.75} />
                )}
                <span className="truncate">{graphNameFromRoot(root, 'your notes')}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {existing.length > 0 ? (
        // Compact create row under the list: a new graph next to the
        // existing ones is the secondary action here, not the headline.
        <div className="mt-auto space-y-2">
          <ChooserDivider>or create new graph</ChooserDivider>
          <div className="flex gap-2">
            <Input
              aria-label="Name"
              placeholder="New name"
              value={name}
              disabled={pending}
              aria-invalid={nameTaken}
              onChange={(event) => setTypedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void create()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={pending || cleanName === null || nameTaken}
              onClick={() => void create()}
            >
              {busy === 'create' ? <Spinner /> : null}
              Create
            </Button>
          </div>
          {nameTaken ? (
            <p className="text-xs text-destructive">That name already exists in iCloud Drive.</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-auto space-y-2">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-xs font-medium text-text-secondary">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              disabled={!available || pending}
              onChange={(event) => setTypedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void create()
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!available || pending || cleanName === null}
            onClick={() => void create()}
          >
            {busy === 'create' ? <Spinner /> : <Cloud aria-hidden strokeWidth={1.75} />}
            {busy === 'create' ? 'Setting up…' : 'Create'}
          </Button>
        </div>
      )}
    </section>
  )
}

function ChooserDivider({ children }: { children: string }): ReactElement {
  return (
    <div className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className="text-2xs font-medium text-text-muted">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  )
}
