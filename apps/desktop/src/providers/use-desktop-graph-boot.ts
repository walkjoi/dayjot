import { useEffect } from 'react'
import { type RecentGraph } from '@dayjot/core'
import { isMainWindow } from '@/lib/windows/window-role'

/** The graph provider's channels for the main-window boot leg. */
export interface DesktopGraphBootOptions {
  /** Refresh the recents list, surfacing read errors (this is the primary load). */
  loadRecents: (options?: { surfaceErrors?: boolean }) => Promise<RecentGraph[]>
  /** Open a graph by root; resolves once the open settles either way. */
  openRecent: (root: string) => Promise<boolean>
  /** No recents to reopen — park on the chooser. */
  onChoose: () => void
}

/**
 * Main-window boot: reopen the most recent graph so the app resumes where the
 * user left off, or park on the chooser. One of GraphProvider's two boot
 * legs — note-window session adoption (`useNoteWindowBoot`) is the other;
 * exactly one runs per window, decided here by window role.
 */
export function useDesktopGraphBoot({
  loadRecents,
  openRecent,
  onChoose,
}: DesktopGraphBootOptions): void {
  useEffect(() => {
    if (!isMainWindow()) {
      return
    }
    let active = true
    void (async () => {
      const list = await loadRecents({ surfaceErrors: true })
      if (!active) {
        return
      }
      if (list.length > 0) {
        await openRecent(list[0]!.root)
      } else {
        onChoose()
      }
    })()
    return () => {
      active = false
    }
  }, [loadRecents, openRecent, onChoose])
}
