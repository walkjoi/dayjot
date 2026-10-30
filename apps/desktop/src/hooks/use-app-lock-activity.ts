import { useEffect } from 'react'
import { recordAppActivity } from '@dayjot/core'

const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const

/** Input is reported at most this often; it fires far faster than the idle clock needs. */
const REPORT_INTERVAL_MS = 5_000

/**
 * Report this window's keyboard and pointer input to the shell's idle clock.
 * The first input after a quiet spell goes out at once: the shell needs to see
 * it to notice a deadline that passed while the Mac slept. Every window runs
 * this, so work in a note window keeps the app unlocked too.
 *
 * @param enabled  Whether input should count (an unlocked app with a password).
 */
export function useAppLockActivity(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    let lastReportMs = Number.NEGATIVE_INFINITY

    function onActivity(): void {
      const nowMs = Date.now()
      if (nowMs - lastReportMs < REPORT_INTERVAL_MS) {
        return
      }
      lastReportMs = nowMs
      recordAppActivity().catch((cause: unknown) => {
        console.error('failed to report activity to the app lock:', cause)
      })
    }

    const options = { capture: true, passive: true }
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, options)
    }
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, options)
      }
    }
  }, [enabled])
}
