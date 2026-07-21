import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  clampEditorTextSize,
  EDITOR_TEXT_SIZE_RANGE,
  errorMessage,
  hasBridge,
  listNotes,
  type EditorFont,
  type ThemePreference,
} from '@dayjot/core'
import { useAppVersion } from '@/hooks/use-app-version'
import { marketingVersion } from '@/lib/marketing-version'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { ConnectGithubDrawer } from '@/mobile/connect-github-drawer'
import { MobileScreenHeader } from '@/mobile/screen-header'
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsNavRow,
  SettingsSegmentedRow,
  SettingsSelectRow,
  SettingsStepperRow,
  SettingsSwitchRow,
  SettingsValueRow,
  type SegmentedOption,
} from '@/mobile/settings-list'
import { useMobileSyncStatus } from '@/mobile/use-sync-status'
import { useGraph } from '@/providers/graph-provider'
import { useSettings } from '@/providers/settings-provider'
import { useSyncContext } from '@/providers/sync-provider'
import { useRouter } from '@/routing/router'

const THEME_OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const NOTE_FONT_OPTIONS: readonly { value: EditorFont; label: string }[] = [
  { value: 'wenkai', label: '霞鹜文楷 LXGW WenKai' },
  { value: 'source-han-serif', label: '思源宋体 Source Han Serif' },
  { value: 'literata', label: 'Literata' },
  { value: 'quattro', label: 'iA Writer Quattro' },
  { value: 'inter', label: 'Inter' },
]

/**
 * The mobile Settings screen — a pushed card (route kind `settings`) in the
 * iOS inset-grouped idiom, replacing the old bottom-sheet hodgepodge. The
 * graph row discloses into the Graphs switcher screen; appearance and editor
 * preferences edit the shared settings document (the same keys desktop
 * exposes); the backup group mirrors the status pill's engine state, connects
 * GitHub for the local graph (the {@link ConnectGithubDrawer} sheet — iCloud
 * graphs sync through the container instead, Plan 21), and can disconnect.
 */
export function MobileSettings(): ReactElement {
  const { back, canBack, navigate } = useRouter()
  const { graph, mobileStorageKind } = useGraph()
  const { settings, updateSettings } = useSettings()
  const version = useAppVersion()
  const sync = useSyncContext()
  // Shared with the status pill (one hook, one query cache entry) — and null
  // until the conflict count is known, so the row never claims `Backed up`
  // over conflict markers already on disk and then flips.
  const status = useMobileSyncStatus()
  const [disconnecting, setDisconnecting] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)

  const { data: notes } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'mobile-note-count'],
    queryFn: () => listNotes(),
    enabled: hasBridge() && graph !== null,
  })

  const backup = sync?.backup ?? null
  const repo = backup !== null && backup.phase === 'connected' ? backup.repo : null
  // The connect entry point is local-graph-only (iCloud sync and a Git remote
  // are mutually exclusive per graph, Plan 21) and waits out the controller's
  // `loading` phase so the row never flashes on a graph that turns out to be
  // connected.
  const canConnect = mobileStorageKind === 'local' && backup?.phase === 'disconnected'

  // Stop backing this graph up and forget the GitHub credential (one graph
  // per device — unlinking is signing out). The local clone stays; the
  // controller restarts into its disconnected state, and re-connecting
  // re-onboards.
  async function disconnect(): Promise<void> {
    if (sync === null) {
      return
    }
    setDisconnecting(true)
    try {
      await sync.disconnectGraph()
      await sync.signOut()
    } catch (err) {
      console.error('GitHub disconnect failed:', errorMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const storageLabel =
    mobileStorageKind === 'icloud'
      ? 'iCloud Drive'
      : mobileStorageKind === 'local'
        ? 'This device'
        : undefined

  return (
    <div
      className="flex h-full w-screen flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <MobileScreenHeader
        title="Settings"
        onBack={() => (canBack ? back() : navigate({ kind: 'today' }))}
      />
      <main
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex flex-col gap-6 px-4 py-4">
          <SettingsGroup header="Notebook">
            <SettingsNavRow
              label={graph?.name ?? '—'}
              value={storageLabel}
              onPress={() => navigate({ kind: 'graphs' })}
            />
          </SettingsGroup>

          <SettingsGroup header="Appearance">
            <SettingsSegmentedRow
              label="Theme"
              value={settings.theme}
              options={THEME_OPTIONS}
              onChange={(theme) => updateSettings({ theme })}
            />
            <SettingsStepperRow
              label="Text size"
              value={`${settings.editorTextSize} px`}
              canDecrement={settings.editorTextSize > EDITOR_TEXT_SIZE_RANGE.min}
              canIncrement={settings.editorTextSize < EDITOR_TEXT_SIZE_RANGE.max}
              onDecrement={() =>
                updateSettings({ editorTextSize: clampEditorTextSize(settings.editorTextSize - 1) })
              }
              onIncrement={() =>
                updateSettings({ editorTextSize: clampEditorTextSize(settings.editorTextSize + 1) })
              }
            />
          </SettingsGroup>

          <SettingsGroup
            header="Note font"
            footer="The typeface notes are written and read in. Every choice covers Chinese and English."
          >
            {NOTE_FONT_OPTIONS.map((option) => (
              <SettingsSelectRow
                key={option.value}
                label={option.label}
                selected={settings.editorFont === option.value}
                onPress={() => updateSettings({ editorFont: option.value })}
              />
            ))}
          </SettingsGroup>

          <SettingsGroup header="Editor">
            <SettingsSwitchRow
              label="Smooth caret animation"
              checked={settings.editorSmoothCaretAnimation}
              onCheckedChange={(editorSmoothCaretAnimation) =>
                updateSettings({ editorSmoothCaretAnimation })
              }
            />
            <SettingsSwitchRow
              label="Start with a bullet"
              checked={settings.editorDefaultBullet}
              onCheckedChange={(editorDefaultBullet) => updateSettings({ editorDefaultBullet })}
            />
            <SettingsSwitchRow
              label="Bullet after a heading"
              checked={settings.editorBulletAfterHeading}
              onCheckedChange={(editorBulletAfterHeading) =>
                updateSettings({ editorBulletAfterHeading })
              }
            />
          </SettingsGroup>

          {repo !== null || status !== null || canConnect ? (
            <SettingsGroup
              header="Backup"
              footer={
                canConnect
                  ? 'Sync notes with DayJot on your other devices.'
                  : (status?.detail ?? null)
              }
            >
              {repo !== null ? (
                <SettingsValueRow label="GitHub" value={`${repo.owner}/${repo.name}`} />
              ) : null}
              {status !== null ? <SettingsValueRow label="Status" value={status.label} /> : null}
              {canConnect ? (
                <SettingsActionRow label="Connect GitHub" onPress={() => setConnectOpen(true)} />
              ) : null}
              {repo !== null ? (
                <SettingsActionRow
                  label="Disconnect GitHub"
                  tone="destructive"
                  pending={disconnecting}
                  onPress={() => void disconnect()}
                />
              ) : null}
            </SettingsGroup>
          ) : null}

          <SettingsGroup header="About">
            <SettingsValueRow
              label="Notes"
              value={notes === undefined ? '…' : String(notes.length)}
            />
            <SettingsValueRow
              label="Version"
              value={version === null ? '…' : marketingVersion(version)}
            />
          </SettingsGroup>
        </div>
      </main>
      <ConnectGithubDrawer open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  )
}
