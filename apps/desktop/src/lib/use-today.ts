import { useEffect, useState } from 'react'
import { todayIso } from './dates'

/**
 * Today's ISO date as **live** state: re-renders when local midnight passes
 * (foundations hardening — an app left open overnight previously kept
 * yesterday's "Today" until some unrelated re-render). The timer re-arms each
 * rollover; a small pad absorbs timer drift around the boundary.
 *
 * The timer alone can fire late — it is throttled while the window is hidden
 * and stalls while the Mac sleeps — so the clock is also re-read (and the
 * timer re-armed) whenever the window comes back. Without that, a day left on
 * screen overnight could still pass for today the next morning.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayIso)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = (): void => {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        setToday(todayIso())
        arm()
      }, midnight.getTime() - now.getTime() + 250)
    }
    const resync = (): void => {
      clearTimeout(timer)
      setToday(todayIso())
      arm()
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        resync()
      }
    }
    arm()
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', resync)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
  return today
}
