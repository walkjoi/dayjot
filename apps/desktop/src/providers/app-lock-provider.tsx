import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  errorMessage,
  getAppLockStatus,
  hasBridge,
  lockApp,
  setAutoLockTimeout,
  subscribeAppLockChanged,
  type AppLockStatus,
} from '@dayjot/core'
import { useAppLockActivity } from '@/hooks/use-app-lock-activity'
import { useMainWindowEffect } from '@/hooks/use-main-window-effect'
import { startOperation } from '@/lib/operations'
import { trackSubscriptions } from '@/lib/subscriptions'
import { useSettings } from '@/providers/settings-provider'

/**
 * This window's view of the app lock. The shell owns the state; every window
 * mirrors it from one change event, so locking or unlocking anywhere applies
 * everywhere at once.
 */

/** `pending` until the shell first answers, which must hide notes like `locked`. */
export type AppLockPhase = 'pending' | 'locked' | 'unlocked'

interface AppLockContextValue {
  phase: AppLockPhase
  /** Whether a password exists, so the app can lock at all. */
  configured: boolean
  /** Lock now, or offer to set a password first when none exists. */
  requestLock: () => Promise<void>
  /** Whether the set-a-password step of {@link requestLock} is showing. */
  setupOpen: boolean
  closeSetup: () => void
}

const AppLockContext = createContext<AppLockContextValue | null>(null)

/** Plain-browser dev has no shell, so nothing can lock. */
const NO_SHELL_STATUS: AppLockStatus = { locked: false, configured: false }

/** A window that can't learn the state fails closed: lock screen, not notes. */
const UNREADABLE_STATUS: AppLockStatus = { locked: true, configured: true }

function phaseFor(status: AppLockStatus | null): AppLockPhase {
  if (status === null) {
    return 'pending'
  }
  return status.locked ? 'locked' : 'unlocked'
}

interface AppLockProviderProps {
  children: ReactNode
}

export function AppLockProvider({ children }: AppLockProviderProps): ReactElement {
  const { settings } = useSettings()
  const [status, setStatus] = useState<AppLockStatus | null>(() =>
    hasBridge() ? null : NO_SHELL_STATUS,
  )
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    if (!hasBridge()) {
      return
    }
    const subscriptions = trackSubscriptions()
    let disposed = false
    async function follow(): Promise<void> {
      // Subscribe first, so a change can't slip between the read and the listener.
      await subscriptions.add(subscribeAppLockChanged(setStatus))
      const initial = await getAppLockStatus()
      if (!disposed) {
        setStatus(initial)
      }
    }
    follow().catch((cause: unknown) => {
      console.error('failed to read the app lock state:', cause)
      if (!disposed) {
        setStatus(UNREADABLE_STATUS)
      }
    })
    return () => {
      disposed = true
      subscriptions.disposeAll()
    }
  }, [])

  useMainWindowEffect(() => {
    if (!hasBridge()) {
      return
    }
    setAutoLockTimeout(settings.autoLockMinutes).catch((cause: unknown) => {
      console.error('failed to apply the auto-lock delay:', cause)
    })
  }, [settings.autoLockMinutes])

  useAppLockActivity(status !== null && status.configured && !status.locked)

  const requestLock = useCallback(async () => {
    if (!hasBridge()) {
      return
    }
    try {
      if (!(await lockApp())) {
        setSetupOpen(true)
      }
    } catch (cause: unknown) {
      startOperation('Locking DayJot').fail(errorMessage(cause))
    }
  }, [])

  const closeSetup = useCallback(() => setSetupOpen(false), [])

  const value = useMemo<AppLockContextValue>(
    () => ({
      phase: phaseFor(status),
      configured: status?.configured ?? false,
      requestLock,
      setupOpen,
      closeSetup,
    }),
    [status, requestLock, setupOpen, closeSetup],
  )

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
}

/** Read this window's app-lock state. Must be used within {@link AppLockProvider}. */
export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext)
  if (context === null) {
    throw new Error('useAppLock must be used within an AppLockProvider')
  }
  return context
}
