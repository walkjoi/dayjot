import { useEffect, useState, type ReactElement } from 'react'
import { useForm } from 'react-hook-form'
import { errorMessage, unlockApp } from '@dayjot/core'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useRestoreFocus } from '@/hooks/use-restore-focus'

interface AppLockFormValues {
  password: string
}

/**
 * The lock screen's password prompt. A correct password needs no handling
 * here: the shell's change event takes the whole screen down, in every window.
 *
 * The field takes focus from the dialog, not `autoFocus`: that would run before
 * {@link useRestoreFocus} records what had focus, and the caret wouldn't return
 * to the note on unlock.
 */
export function AppLockForm(): ReactElement {
  useRestoreFocus()
  const { register, handleSubmit, reset, setFocus, formState } = useForm<AppLockFormValues>({
    defaultValues: { password: '' },
  })
  const [failure, setFailure] = useState<string | null>(null)

  // At launch this mounts before the window is on screen, where the dialog's
  // focus doesn't take; typing has to work as soon as the window does.
  useEffect(() => {
    function focusField(): void {
      setFocus('password')
    }
    window.addEventListener('focus', focusField)
    return () => window.removeEventListener('focus', focusField)
  }, [setFocus])

  const submit = handleSubmit(async ({ password }) => {
    setFailure(null)
    try {
      if (await unlockApp(password)) {
        return
      }
      setFailure('Incorrect password.')
    } catch (cause: unknown) {
      setFailure(errorMessage(cause))
    }
    reset()
    setFocus('password')
  })

  return (
    <form
      className="flex w-full max-w-64 flex-col items-center gap-4"
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      <Lock aria-hidden strokeWidth={1.75} className="size-5 text-text-muted" />
      <DialogTitle className="text-sm font-medium text-text">DayJot is locked</DialogTitle>
      <Input
        type="password"
        autoComplete="current-password"
        aria-label="Password"
        aria-invalid={failure !== null}
        placeholder="Password"
        {...register('password', { required: true })}
      />
      {failure !== null ? (
        <p role="alert" className="text-center text-xs text-destructive">
          {failure}
        </p>
      ) : null}
      <Button type="submit" size="sm" className="w-full" disabled={formState.isSubmitting}>
        Unlock
      </Button>
    </form>
  )
}
