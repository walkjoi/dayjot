import { z } from 'zod'
import { call } from './invoke'

const appVersionSchema = z.string()

/**
 * Returns the desktop application version reported by the Rust shell.
 *
 * Serves as the canonical round-trip example for the IPC boundary: a real
 * `#[tauri::command]`, a zod-validated response, no direct `invoke` in the UI.
 */
export async function getAppVersion(): Promise<string> {
  return call('app_version', {}, appVersionSchema)
}

const icloudPendingCountSchema = z.number().int().nonnegative()

/**
 * Which placeholders a pending count covers: `'notes'` is markdown under the
 * note directories, `'all'` is everything.
 */
export type IcloudDownloadScope = 'notes' | 'all'

/**
 * Counts the not-yet-local placeholders in `scope` under `root` without
 * requesting anything (the iCloud settings section surfaces it).
 */
export async function icloudPendingCount(
  root: string,
  scope: IcloudDownloadScope,
): Promise<number> {
  return call(
    'icloud_pending_count',
    { root, notesOnly: scope === 'notes' },
    icloudPendingCountSchema,
  )
}

const icloudStatusSchema = z.object({
  available: z.boolean(),
  documentsRoot: z.string().nullable(),
  /** Every graph in the container (name-sorted) — onboarding lists them. */
  existingGraphRoots: z.array(z.string()),
})

/**
 * Whether this build can reach its iCloud Drive container (Plan 21). Dev
 * builds without the iCloud entitlement/provisioning profile honestly report
 * unavailable.
 */
export type IcloudStatus = z.infer<typeof icloudStatusSchema>

/** Resolve iCloud container availability (desktop settings, Plan 21). */
export async function icloudStatus(): Promise<IcloudStatus> {
  return call('icloud_status', {}, icloudStatusSchema)
}

const icloudAdoptedRootSchema = z.string()

/**
 * Copy the open graph into the iCloud container and return the new root
 * (Plan 21 Phase 1 move-in). The copy is count+byte verified; the original
 * graph stays untouched at its old path as the recovery copy. The caller
 * re-opens the graph at the returned root and runs a baseline conflict scan.
 */
export async function icloudAdoptGraph(generation: number): Promise<string> {
  return call('icloud_adopt_graph', { generation }, icloudAdoptedRootSchema)
}

const icloudSweepChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['upsert', 'remove']),
  modifiedMs: z.number().optional(),
})

const icloudSweepOutcomeSchema = z.object({
  changed: z.array(icloudSweepChangeSchema),
  needsReview: z.array(z.string()),
  deferred: z.array(z.string()),
  autoResolved: z.number().int().nonnegative(),
})

/**
 * What one iCloud conflict sweep did (Plan 21): the files it rewrote or
 * removed (reindex these directly), the paths now carrying markers, the
 * paths deferred for dirty sessions, and how many conflicts auto-resolved.
 */
export type IcloudSweepOutcome = z.infer<typeof icloudSweepOutcomeSchema>

/** Options for {@link icloudConflictsScan}. */
export interface IcloudScanOptions {
  /** The open graph's generation — the scan is pinned to it. */
  generation: number
  /** Notes with dirty open sessions; their conflicts defer to the next scan. */
  skipPaths?: string[]
  /**
   * External changes just applied cleanly — their content becomes the new
   * shadow merge base. Never pass this device's own writes.
   */
  ingestedPaths?: string[]
  /**
   * Record a fill-only baseline (adoption): notes without a base snapshot
   * their current content. Safe to repeat — existing bases never move here.
   */
  recordBaseline?: boolean
}

/** Run an iCloud conflict sweep over the open graph (Plan 21 Phase 2). */
export async function icloudConflictsScan(options: IcloudScanOptions): Promise<IcloudSweepOutcome> {
  return call(
    'icloud_conflicts_scan',
    {
      generation: options.generation,
      skipPaths: options.skipPaths ?? [],
      ingestedPaths: options.ingestedPaths ?? [],
      recordBaseline: options.recordBaseline ?? false,
    },
    icloudSweepOutcomeSchema,
  )
}

const voidResponseSchema = z.null()

/**
 * Start the iCloud metadata-query watch over `root` (Plan 21 Phase 2).
 * Conflict paths emit as `icloud:conflicts`.
 */
export async function icloudWatchStart(root: string): Promise<void> {
  await call('icloud_watch_start', { root }, voidResponseSchema)
}

/** Stop the active iCloud watch (graph switch). Idempotent. */
export async function icloudWatchStop(): Promise<void> {
  await call('icloud_watch_stop', {}, voidResponseSchema)
}
