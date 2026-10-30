import { z } from 'zod'
import { getBridge, type Unlisten } from '../ipc/bridge'
import { call } from '../ipc/invoke'
import type { AutoLockMinutes } from '../settings/schema'

/**
 * Typed bindings for the app lock, the password screen over every window. The
 * shell owns the gate so it spans windows and survives a webview reload
 * (`apps/desktop/src-tauri/src/app_lock.rs`); the password never reaches this
 * layer's storage — it crosses the IPC once, to be hashed or checked there.
 */

/** Emitted to every window whenever the lock state changes. */
export const APP_LOCK_CHANGED_EVENT = 'app-lock:changed'

const appLockStatusSchema = z.object({
  /** The lock screen is up. */
  locked: z.boolean(),
  /** A password exists, so the app can lock at all. */
  configured: z.boolean(),
})

/** The lock state a window renders from. */
export type AppLockStatus = z.infer<typeof appLockStatusSchema>

/** Commands that return `()` from Rust serialize as `null` over IPC. */
const voidSchema = z.null()

const outcomeSchema = z.boolean()

/** The current lock state. */
export function getAppLockStatus(): Promise<AppLockStatus> {
  return call('app_lock_status', {}, appLockStatusSchema)
}

/** Subscribe to lock-state changes (including ones another window caused). */
export function subscribeAppLockChanged(
  handler: (status: AppLockStatus) => void,
): Promise<Unlisten> {
  return getBridge().listen(APP_LOCK_CHANGED_EVENT, (payload) => {
    const parsed = appLockStatusSchema.safeParse(payload)
    if (parsed.success) {
      handler(parsed.data)
    } else {
      // Contract drift must be loud: a dropped change leaves a window showing
      // the wrong side of the lock.
      console.error('invalid app-lock:changed payload:', parsed.error)
    }
  })
}

/** Lock now. Resolves false when no password exists yet, so nothing locked. */
export function lockApp(): Promise<boolean> {
  return call('app_lock_lock', {}, outcomeSchema)
}

/** Unlock with `password`. Resolves false when it's wrong. */
export function unlockApp(password: string): Promise<boolean> {
  return call('app_lock_unlock', { password }, outcomeSchema)
}

/**
 * Set or replace the password. `current` must match an existing password;
 * resolves false when it doesn't.
 */
export function setAppLockPassword(current: string | null, next: string): Promise<boolean> {
  return call('app_lock_set_password', { current, next }, outcomeSchema)
}

/** Remove the password, turning the lock off. Resolves false on a wrong `current`. */
export function removeAppLockPassword(current: string): Promise<boolean> {
  return call('app_lock_remove_password', { current }, outcomeSchema)
}

/** Tell the shell how long the app may sit idle before it locks. */
export async function setAutoLockTimeout(minutes: AutoLockMinutes): Promise<void> {
  await call('app_lock_set_idle_timeout', { minutes }, voidSchema)
}

/** Report keyboard or pointer input to the shell's idle clock. */
export async function recordAppActivity(): Promise<void> {
  await call('app_lock_record_activity', {}, voidSchema)
}
