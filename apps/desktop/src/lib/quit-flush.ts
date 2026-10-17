import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirmQuit, hasBridge, hideWindowForClose, subscribeQuitRequested } from '@dayjot/core'
import { flushOpenDocuments } from '@/editor/open-documents'
import { flushBackup } from '@/lib/backup-flush'
import { isMacosDesktop } from '@/lib/platform'
import { flushSettings } from '@/lib/settings-flush'
import { trackSubscriptions } from '@/lib/subscriptions'
import { isMainWindow } from '@/lib/windows/window-role'

/**
 * Save unsaved notes and settings before the webview goes away. React unmount
 * effects don't run on these paths:
 *
 * - **Window close** (red button, ⌘W): the close waits for the flush. The
 *   macOS main window is then hidden instead of closed, through the shell so
 *   it leaves fullscreen first (`hideWindowForClose`).
 * - **App quit** (⌘Q, Dock, logout): the shell defers termination and emits
 *   `app:quit-requested`; we flush, then `confirmQuit()` lets it proceed, even
 *   if a flush failed (that error is already shown on the note).
 * - **Reload** (dev): `beforeunload` can't await, but writes already
 *   dispatched still reach the shell.
 */
export function installQuitFlush(): () => void {
  // Plain-browser dev has no native window to hook.
  if (!hasBridge()) {
    return () => {}
  }

  // Subscriptions that resolve after teardown (StrictMode) are disposed on arrival.
  const subscriptions = trackSubscriptions()
  const currentWindow = getCurrentWindow()

  void subscriptions.add(
    currentWindow.onCloseRequested(async (event) => {
      const shouldHide = isMacosDesktop && isMainWindow()
      if (shouldHide) {
        // Before awaiting: otherwise AppKit destroys the last window and the app exits.
        event.preventDefault()
      }
      await flushAll()
      if (shouldHide) {
        await hideWindowForClose()
      }
    }),
  )

  const quit = async (): Promise<void> => {
    await flushAll()
    await confirmQuit()
  }
  void subscriptions.add(
    subscribeQuitRequested(() => {
      void quit()
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

/** Notes and settings first, so the backup commit (local only) includes them. */
async function flushAll(): Promise<void> {
  await Promise.allSettled([flushOpenDocuments(), flushSettings()])
  await flushBackup()
}
