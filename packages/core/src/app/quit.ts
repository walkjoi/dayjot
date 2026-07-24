import { z } from 'zod'
import { getBridge, type Unlisten } from '../ipc/bridge'
import { call } from '../ipc/invoke'

/**
 * The quit-time flush handshake. macOS ⌘Q requests app exit without closing
 * the window first, so the window's close-requested flush never runs; the Rust
 * shell defers that exit once and emits {@link QUIT_REQUESTED_EVENT}, the
 * frontend flushes dirty note buffers, then confirms — and the confirm exits
 * for real.
 */

/** Event name the Rust shell emits when it deferred an exit for flushing. */
export const QUIT_REQUESTED_EVENT = 'app:quit-requested'

/** Subscribe to the shell's deferred-quit notification. */
export function subscribeQuitRequested(handler: () => void): Promise<Unlisten> {
  return getBridge().listen(QUIT_REQUESTED_EVENT, () => {
    handler()
  })
}

/**
 * Confirm a deferred quit after flushing. The app exits inside this call, so
 * the returned promise may never settle — fire and forget.
 */
export function confirmQuit(): Promise<void> {
  return call('quit_confirm', {}, z.null()).then(() => undefined)
}

/**
 * Hide the current window as its ⌘W "close" behavior. On macOS the shell
 * first leaves the window's fullscreen Space, waiting on AppKit's
 * did-exit-full-screen notification — hiding a window that still owns a
 * Space strands it as a black screen. The webview cannot sequence that exit
 * itself: tao clears the state `isFullscreen()` reads synchronously inside
 * `setFullscreen(false)`, before the transition even starts.
 */
export function hideWindowForClose(): Promise<void> {
  return call('window_hide_for_close', {}, z.null()).then(() => undefined)
}
