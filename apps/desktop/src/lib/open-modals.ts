import { useLayoutEffect } from 'react'

/**
 * The modal surfaces open in this window: every dialog built on the shared
 * `Dialog` wrapper (`components/ui/dialog.tsx`) joins while it is open, and
 * overlays built outside it (the command palette) join through
 * {@link useModalRegistration}. App commands consult {@link hasOpenModal}
 * before running, so no keystroke or native menu item can navigate, create a
 * note, or toggle chrome behind a dialog the user is answering.
 *
 * One registry instead of one flag per surface: a new dialog is covered by
 * construction, not by remembering to wire it into the shortcut gate. Each
 * webview loads its own copy of this module, so the scope is one window.
 */

const openModals = new Set<symbol>()

/** Record a modal as open until the returned release runs (safe to call twice). */
export function registerOpenModal(): () => void {
  const token = Symbol('open-modal')
  openModals.add(token)
  return () => {
    openModals.delete(token)
  }
}

/** Whether any modal surface is open in this window. */
export function hasOpenModal(): boolean {
  return openModals.size > 0
}

/**
 * Keep the calling surface registered while `open` is true. Registers in a
 * layout effect, during the commit that opens the surface, so a keystroke
 * delivered right after can't slip past the gate.
 */
export function useModalRegistration(open: boolean): void {
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    return registerOpenModal()
  }, [open])
}
