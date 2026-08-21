/**
 * Observers for this device's own note/asset writes.
 *
 * Every local write flows file → watcher → `index:changed`, and the whole
 * derived layer hangs off that event: incremental reindex, query
 * invalidation, the sync engine's dirty mark, and open-editor
 * reconciliation. The own-write channel here is the piece a watcher event
 * can't provide: which changes were ours.
 */
const ownWriteListeners = new Set<(path: string) => void>()

/**
 * Observe this device's own note/asset writes. The iCloud sync controller
 * (Plan 21) uses it to tell its own writes apart from external arrivals:
 * only external content may advance a note's shadow merge base, and a
 * watcher event alone can't make that distinction.
 */
export function subscribeOwnWrites(handler: (path: string) => void): () => void {
  ownWriteListeners.add(handler)
  return () => {
    ownWriteListeners.delete(handler)
  }
}

/**
 * Notify own-write observers ({@link subscribeOwnWrites}). Write commands
 * call this after their write has landed.
 */
export function notifyOwnWrite(path: string): void {
  for (const handler of [...ownWriteListeners]) {
    try {
      handler(path)
    } catch (err) {
      // One misbehaving observer must not break the write echo for everyone.
      console.error('own-write observer failed:', err)
    }
  }
}
