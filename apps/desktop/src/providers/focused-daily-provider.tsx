import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  contextSidebarTarget,
  type ContextSidebarTarget,
} from '@/components/context-sidebar/sidebar-route'
import { useToday } from '@/lib/use-today'
import { effectiveDailyDate } from '@/routing/route'
import { useRouter } from '@/routing/router'

/**
 * Which day the daily canvas is showing, so the context sidebar can describe
 * *that* day rather than the one the route would resolve to.
 *
 * The canvas shows exactly one day, but the `today` route pins its date at
 * arrival time: after midnight the route still says "today" while the canvas
 * (deliberately) keeps the day the user arrived on. Without this, the right
 * sidebar — derived purely from the route — would flip to the new calendar
 * day while the user is still editing yesterday's note, so its note actions
 * (pin, publish) and backlinks would describe the wrong note.
 *
 * The daily canvas is the only writer (it reports the day it shows); the
 * workspace shell reads it and falls back to the routed day when no canvas is
 * mounted. Split into separate value/setter contexts so the canvas can
 * consume the (stable) setter without re-rendering on every read.
 */

const FocusedDailyDateContext = createContext<string | null>(null)
const SetFocusedDailyDateContext = createContext<(date: string | null) => void>(() => {})

/** Provides the focused-day state to the workspace shell and the daily canvas. */
export function FocusedDailyProvider({ children }: { children: ReactNode }): ReactElement {
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  return (
    <SetFocusedDailyDateContext.Provider value={setFocusedDate}>
      <FocusedDailyDateContext.Provider value={focusedDate}>
        {children}
      </FocusedDailyDateContext.Provider>
    </SetFocusedDailyDateContext.Provider>
  )
}

/** The day on the daily canvas, or `null` when no canvas is mounted. */
export function useFocusedDailyDate(): string | null {
  return useContext(FocusedDailyDateContext)
}

/** Record (or clear, with `null`) the focused day. No-op without a provider. */
export function useSetFocusedDailyDate(): (date: string | null) => void {
  return useContext(SetFocusedDailyDateContext)
}

/**
 * The context-sidebar target for the current route, following the day the
 * daily canvas shows and snapping back to the routed subject on navigation.
 *
 * On a daily view the sidebar describes the canvas's day, not the one the
 * route resolves to (the `today` route pins its date at arrival, so after
 * midnight they differ) — the {@link effectiveDailyDate} precedence the
 * note-scoped commands share. The reported day deliberately *stays* through
 * transient moves — opening ⌘K, clicking a sidebar button — and resets only
 * on the signals a navigation produces (`arrivalSeq`/`entryId`), pre-paint
 * (a layout effect) so no stale day shows before the canvas re-reports its
 * target; with nothing reported it is just the routed subject.
 */
export function useDailyContextTarget(): ContextSidebarTarget | null {
  const { route, arrivalSeq, entryId } = useRouter()
  const today = useToday()
  const focusedDailyDate = useFocusedDailyDate()
  const setFocusedDailyDate = useSetFocusedDailyDate()
  useLayoutEffect(() => {
    setFocusedDailyDate(null)
  }, [arrivalSeq, entryId, setFocusedDailyDate])
  const daily = effectiveDailyDate(route, today, focusedDailyDate)
  return daily !== null ? { kind: 'daily', date: daily } : contextSidebarTarget(route, today)
}
