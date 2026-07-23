import { getCurrentWindow, type Window } from '@tauri-apps/api/window'
import { confirmQuit, hasBridge, subscribeQuitRequested } from '@dayjot/core'
import { flushOpenDocuments } from '@/editor/open-documents'
import { flushBackup } from '@/lib/backup-flush'
import { isMacosDesktop } from '@/lib/platform'
import { flushSettings } from '@/lib/settings-flush'
import { trackSubscriptions } from '@/lib/subscriptions'
import { isMainWindow } from '@/lib/windows/window-role'

/**
 * Quit-time persistence: the webview never dies with dirty note buffers still
 * inside their save debounce — or with settings writes still in their queue.
 * Three exits, three hooks:
 *
 * - **Window close** (red button, ⌘W): registering a JS `onCloseRequested`
 *   listener defers the close until the handler returns, so the flush is
 *   awaited before the window is destroyed. On macOS the main window stays
 *   alive and is hidden after flushing, preserving normal last-window close
 *   behavior without terminating the app; secondary windows still close.
 * - **App quit** (⌘Q): never reaches close-requested — the Rust shell defers
 *   `ExitRequested` once and emits `app:quit-requested`; we flush, then
 *   `confirmQuit()` exits for real (even if a flush failed: its error is
 *   already surfaced per-note, and refusing to quit would trap the user).
 * - **Webview unload** (dev reloads): `beforeunload` can't await, but writes
 *   dispatched before teardown still reach the Rust process — a belt.
 *
 * Mobile's exit is backgrounding, not quitting — its leg of the same flush
 * sequence lives in `background-flush.ts` (Plan 19, decision 6).
 */
/** Upper bound on waiting out macOS's exit-fullscreen animation. */
const FULLSCREEN_EXIT_TIMEOUT_MS = 2000
const FULLSCREEN_EXIT_POLL_MS = 50

/**
 * Hiding a window that occupies a macOS fullscreen Space leaves the Space
 * alive but empty — a black screen — so ⌘W on a fullscreen window must
 * leave the Space first. `setFullscreen(false)` only starts the transition;
 * the state `isFullscreen()` reads clears when the exit animation finishes,
 * so poll it (bounded) before the caller hides. Best-effort: a failed
 * fullscreen probe must not leave the window refusing to close.
 */
async function exitFullscreenBeforeHide(currentWindow: Window): Promise<void> {
  try {
    if (!(await currentWindow.isFullscreen())) {
      return
    }
    await currentWindow.setFullscreen(false)
    const deadline = Date.now() + FULLSCREEN_EXIT_TIMEOUT_MS
    while ((await currentWindow.isFullscreen()) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, FULLSCREEN_EXIT_POLL_MS))
    }
  } catch {
    // Fall through to the hide; a stuck-open window is worse than a
    // potentially imperfect transition.
  }
}

export function installQuitFlush(): () => void {
  // No bridge → no native shell (plain-browser dev): nothing can quit-flush.
  // getCurrentWindow below is safe to reach only inside a Tauri webview.
  if (!hasBridge()) {
    return () => {}
  }

  // A subscription can resolve after teardown (StrictMode's probe mount) —
  // the tracker disposes it on the spot.
  const subscriptions = trackSubscriptions()
  const currentWindow = getCurrentWindow()

  // Note buffers land first, then the backup commit captures them (a local
  // git commit only — pushing on the way out could stall the quit).
  void subscriptions.add(
    currentWindow.onCloseRequested(async (event) => {
      const shouldHide = isMacosDesktop && isMainWindow()
      if (shouldHide) {
        // Prevent synchronously: waiting until after the flush lets AppKit
        // destroy the last window (and Tauri then terminates the process).
        event.preventDefault()
      }
      await Promise.allSettled([flushOpenDocuments(), flushSettings()])
      await flushBackup()
      if (shouldHide) {
        await exitFullscreenBeforeHide(currentWindow)
        await currentWindow.hide()
      }
    }),
  )

  void subscriptions.add(
    subscribeQuitRequested(() => {
      void Promise.allSettled([flushOpenDocuments(), flushSettings()])
        .then(() => flushBackup())
        .then(() => {
          void confirmQuit()
        })
    }),
  )

  const onBeforeUnload = (): void => {
    void flushOpenDocuments()
    void flushSettings()
    void flushBackup()
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  subscriptions.track(() => window.removeEventListener('beforeunload', onBeforeUnload))

  return () => {
    subscriptions.disposeAll()
  }
}
