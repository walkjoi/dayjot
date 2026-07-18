import {
  audioMemoFromPath,
  hasBridge,
  isSilentStop,
  reconcileAudioMemos,
  subscribeFileChanges,
  type ReconcileStop,
} from '@dayjot/core'
import { createBackgroundReconciler } from '@/lib/background-reconciler'
import { startOperation } from '@/lib/operations'

/**
 * The background memo-filing lifecycle for one graph session. Built on
 * {@link createBackgroundReconciler} (shared with capture): the single-flight
 * loop, focus/online retries, and teardown live there; this adds the filing
 * pass (each recording gets its memo note + daily backlink) and the `filing`
 * flag the mic spinner reads. The provider shrinks to create/start/dispose
 * plus a `schedule()` after its own captures.
 */
export interface AudioMemoReconciler {
  /** Attach the triggers (focus, online, file changes) and run the launch pass. */
  start(): void
  /** Request a pass; coalesces while one runs (at most one follow-up). */
  schedule(): void
  /** True while a pass has memos to file — drives the mic spinner. */
  getFiling(): boolean
  /** Subscribe to `filing` changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Tear down triggers and abort an in-flight pass at its next gate. */
  dispose(): void
}

export interface AudioMemoReconcilerOptions {
  /** The open graph's generation — every pass's reads and writes pin to it. */
  generation: number
}

/** Build the reconciler for one graph session. `dispose()` is terminal. */
export function createAudioMemoReconciler(
  options: AudioMemoReconcilerOptions,
): AudioMemoReconciler {
  let filing = false
  const listeners = new Set<() => void>()
  /** Last surfaced stop message — focus/online retries must not re-toast it. */
  let surfacedStop: string | null = null

  function setFiling(next: boolean): void {
    if (filing === next) {
      return
    }
    filing = next
    for (const listener of listeners) {
      listener()
    }
  }

  function surfaceStop(stopped: ReconcileStop | null): void {
    if (stopped === null) {
      surfacedStop = null
      return
    }
    // Expected, self-healing stops (network/config/stale) stay silent — the
    // next trigger retries.
    if (isSilentStop(stopped) || surfacedStop === stopped.message) {
      return
    }
    surfacedStop = stopped.message
    startOperation('Filing audio memo').fail(stopped.message)
  }

  /** One pass: file pending memos into notes + daily backlinks. */
  const reconcile = async (isStale: () => boolean): Promise<void> => {
    const outcome = await reconcileAudioMemos({
      generation: options.generation,
      isStale,
      onPending: (count) => setFiling(count > 0),
    })
    surfaceStop(outcome.stopped)
  }

  const loop = createBackgroundReconciler({
    pass: reconcile,
    onSettled: () => setFiling(false),
  })

  function start(): void {
    if (loop.isStale()) {
      return
    }
    loop.schedule() // the launch pass: memos left pending by earlier sessions
    loop.retryOnWake() // the network's natural retry signals (focus/online)
    loop.onDispose(() => listeners.clear())
    if (!hasBridge()) {
      return // browser dev: no watcher to follow, no native foreground
    }
    // Foregrounding on iOS doesn't reliably fire `focus`/`online` on the
    // webview — `visibilitychange` → visible does. A memo captured while
    // backgrounded gets its filing pass when the app comes back.
    // Bridge-gated, so desktop keeps focus/online only.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        loop.schedule()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    loop.onDispose(() => document.removeEventListener('visibilitychange', onVisible))
    void subscribeFileChanges((changes) => {
      const hasNewRecording = changes.some(
        (change) => change.kind === 'upsert' && audioMemoFromPath(change.path) !== null,
      )
      if (hasNewRecording) {
        loop.schedule()
      }
    })
      .then((stop) => loop.onDispose(stop)) // onDispose tears down now if we already disposed
      .catch((cause: unknown) => {
        // Degrades to the other triggers (focus/online/capture); surfaced
        // for diagnosis rather than left as an unhandled rejection.
        console.error('audio memo file-change subscription failed:', cause)
      })
  }

  return {
    start,
    schedule: loop.schedule,
    getFiling: () => filing,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: loop.dispose,
  }
}
