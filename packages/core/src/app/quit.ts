import { z } from 'zod'
import { getBridge, type Unlisten } from '../ipc/bridge'
import { call } from '../ipc/invoke'

/**
 * The quit-time flush handshake. A macOS quit closes no windows, so their
 * close-requested flush never runs: the shell defers termination and emits
 * {@link QUIT_REQUESTED_EVENT}, each window flushes and confirms, and the last
 * confirmation lets the quit proceed.
 */

/** Emitted by the shell when it deferred a quit for flushing. */
export const QUIT_REQUESTED_EVENT = 'app:quit-requested'

/** Subscribe to the shell's deferred-quit notification. */
export function subscribeQuitRequested(handler: () => void): Promise<Unlisten> {
  return getBridge().listen(QUIT_REQUESTED_EVENT, () => {
    handler()
  })
}

/**
 * Confirm a deferred quit after flushing. The last confirmation quits the app,
 * so the returned promise may never settle.
 */
export function confirmQuit(): Promise<void> {
  return call('quit_confirm', {}, z.null()).then(() => undefined)
}

/**
 * Hide the current window as its ⌘W "close" behavior. The shell first leaves
 * fullscreen and waits for AppKit to finish: hiding a window that still owns
 * its Space leaves a black screen, and only the shell can see the exit end.
 */
export function hideWindowForClose(): Promise<void> {
  return call('window_hide_for_close', {}, z.null()).then(() => undefined)
}
