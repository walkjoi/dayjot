import type { ReactElement } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { WindowDragRegion } from '@/components/window-drag-region'
import { cn } from '@/lib/utils'
import { useAppLock } from '@/providers/app-lock-provider'
import { AppLockForm } from './app-lock-form'
import { AppLockPasswordDialog } from './app-lock-password-dialog'

/** Above everything the app stacks, Sonner's fixed toasts (999999999) included. */
const LOCK_LAYER_CLASS = 'z-[1000000000]'

/**
 * The opaque layer over a locked window, plus the ⌘L first-run step that sets a
 * password. The workspace stays mounted underneath — unsaved edits, the open
 * note, and background sync all carry on — and comes back exactly as it was.
 *
 * It's a Radix modal, not a plain overlay, because a dialog may already be open
 * when the auto-lock fires: Radix stacks focus traps, so one underneath pauses
 * for this one and resumes on unlock. Keystrokes stop here too, or the document
 * listeners on Tasks and All Notes would see the password being typed. The
 * dialog's usual entrance is off: a fade would show the note through the lock.
 */
export function AppLockScreen(): ReactElement | null {
  const { phase, setupOpen, closeSetup, requestLock } = useAppLock()

  if (phase === 'pending') {
    return <div aria-hidden className={cn('fixed inset-0 bg-surface-app', LOCK_LAYER_CLASS)} />
  }

  if (phase === 'unlocked') {
    return setupOpen ? (
      <AppLockPasswordDialog
        intent="set"
        onClose={closeSetup}
        onDone={() => {
          void requestLock()
        }}
      />
    ) : null
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName={cn('bg-surface-app data-open:animate-none', LOCK_LAYER_CLASS)}
        className={cn(
          'inset-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none bg-surface-app p-8 ring-0 data-open:animate-none sm:max-w-none',
          LOCK_LAYER_CLASS,
        )}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <WindowDragRegion />
        <AppLockForm />
      </DialogContent>
    </Dialog>
  )
}
