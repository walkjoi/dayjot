import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirmQuit, hasBridge, hideWindowForClose, subscribeQuitRequested } from '@dayjot/core'
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
 *   The hide goes through the shell (`hideWindowForClose`), which first
 *   leaves a macOS fullscreen Space — hiding a window that still owns its
 *   Space strands the Space as a black screen, and only the shell can
 *   observe the exit transition completing.
 * - **App quit** (⌘Q): never reaches close-requested — the Rust shell defers
 *   `ExitRequested` once and emits `app:quit-requested`; we flush, then
 *   `confirmQuit()` exits for real (even if a flush failed: its error is
 *   already surfaced per-note, and refusing to quit would trap the user).
 * - **Webview unload** (dev reloads): `beforeunload` can't await, but writes
 *   dispatched before teardown still reach the Rust process — a belt.
 */
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
        await hideWindowForClose()
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
