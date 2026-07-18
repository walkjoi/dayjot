import type { AppError } from '../errors'

/**
 * Why a background reconcile pass ended with items still pending. `config` =
 * a required setting is missing (self-heals when settings change); `stale` =
 * the caller's abort gate fired; anything else is the failing step's error
 * kind (`network` while offline is the expected, silent case).
 */
export interface ReconcileStop {
  reason: 'config' | 'stale' | AppError['kind']
  message: string
}

/**
 * Whether a {@link ReconcileStop} is an expected, self-healing stop that a
 * background controller should swallow rather than surface to the user:
 * `network` (offline — retries on the next trigger), `config` (a setting is
 * missing — the work waits), or `stale` (a graph switch tore the pass down).
 * Any other reason is an unexpected failure worth surfacing or logging.
 * Shared by every background reconcile loop (capture drain, enrichment).
 */
export function isSilentStop(stopped: ReconcileStop): boolean {
  return stopped.reason === 'network' || stopped.reason === 'config' || stopped.reason === 'stale'
}
