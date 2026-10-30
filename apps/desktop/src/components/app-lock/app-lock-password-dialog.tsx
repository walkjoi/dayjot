import { useState, type ReactElement } from 'react'
import { useForm } from 'react-hook-form'
import { errorMessage, removeAppLockPassword, setAppLockPassword } from '@dayjot/core'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useRestoreFocus } from '@/hooks/use-restore-focus'

/** What the dialog does to the app-lock password. */
export type AppLockPasswordIntent = 'set' | 'change' | 'remove'

interface IntentCopy {
  title: string
  description: string
  action: string
}

const COPY: Record<AppLockPasswordIntent, IntentCopy> = {
  set: {
    title: 'Set a password',
    description: 'DayJot will ask for it whenever it locks, and can’t show it to you later.',
    action: 'Set password',
  },
  change: {
    title: 'Change password',
    description: 'DayJot will ask for the new password from now on.',
    action: 'Change password',
  },
  remove: {
    title: 'Remove password',
    description: 'DayJot will stop locking, so anyone at this Mac can open your notes.',
    action: 'Remove password',
  },
}

interface AppLockPasswordForm {
  current: string
  next: string
  confirm: string
}

interface AppLockPasswordDialogProps {
  intent: AppLockPasswordIntent
  onClose: () => void
  /** Runs after the password change lands, once the dialog has closed. */
  onDone?: () => void
}

function FieldError({ message }: { message: string | undefined }): ReactElement | null {
  if (message === undefined) {
    return null
  }
  return (
    <span role="alert" className="text-xs text-destructive">
      {message}
    </span>
  )
}

/**
 * Set, change, or remove the app-lock password. The only rule for a new one is
 * that it isn't empty; retyping it guards against a typo nobody can see, and
 * replacing or removing one takes the current password.
 */
export function AppLockPasswordDialog({
  intent,
  onClose,
  onDone,
}: AppLockPasswordDialogProps): ReactElement {
  useRestoreFocus()
  const { register, handleSubmit, getValues, setError, formState } = useForm<AppLockPasswordForm>({
    defaultValues: { current: '', next: '', confirm: '' },
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const copy = COPY[intent]
  const { errors } = formState

  const submit = handleSubmit(async ({ current, next }) => {
    setSubmitError(null)
    try {
      const applied =
        intent === 'remove'
          ? await removeAppLockPassword(current)
          : await setAppLockPassword(intent === 'change' ? current : null, next)
      if (!applied) {
        setError('current', { message: 'Incorrect password.' }, { shouldFocus: true })
        return
      }
      onClose()
      onDone?.()
    } catch (cause: unknown) {
      setSubmitError(errorMessage(cause))
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          {intent !== 'set' ? (
            <>
              <Input
                type="password"
                autoComplete="current-password"
                aria-label="Current password"
                aria-invalid={errors.current !== undefined}
                placeholder="Current password"
                {...register('current', { required: 'Enter your current password.' })}
              />
              <FieldError message={errors.current?.message} />
            </>
          ) : null}
          {intent !== 'remove' ? (
            <>
              <Input
                type="password"
                autoComplete="new-password"
                aria-label="New password"
                aria-invalid={errors.next !== undefined}
                placeholder="New password"
                {...register('next', { required: 'Enter a password.' })}
              />
              <FieldError message={errors.next?.message} />
              <Input
                type="password"
                autoComplete="new-password"
                aria-label="Confirm new password"
                aria-invalid={errors.confirm !== undefined}
                placeholder="Confirm new password"
                {...register('confirm', {
                  validate: (value) =>
                    value === getValues('next') || 'The passwords don’t match.',
                })}
              />
              <FieldError message={errors.confirm?.message} />
            </>
          ) : null}

          {submitError !== null ? <InlineAlert tone="error">{submitError}</InlineAlert> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={intent === 'remove' ? 'destructive' : 'default'}
              disabled={formState.isSubmitting}
            >
              {copy.action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
