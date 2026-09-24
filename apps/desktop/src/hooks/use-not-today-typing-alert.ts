import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { toast } from 'sonner'

/** One "not today" toast at a time: a repeat replaces it in place. */
const NOT_TODAY_TOAST_ID = 'not-today-note'

interface NotTodayTypingAlertOptions {
  /** Whether the canvas shows a day other than today. */
  notToday: boolean
  /** Changes on every navigation arrival: the alert fires once per visit. */
  visitKey: string
  /** The shown day, as the heading names it. */
  dayLabel: string
  /** Take the canvas to today's note (the toast's action). */
  onGoToday: () => void
}

/**
 * Warn the first time the user writes into a day that isn't today — once per
 * visit to that day. Only text input counts (the native `beforeinput` insert
 * types: typing, IME composition, paste, drop), so reading, checking off a
 * task, or deleting never raises it. The warning names the day and offers the
 * way home; going to today clears it.
 *
 * `containerRef` is the element wrapping the note's editor; `beforeinput`
 * bubbles to it from the contenteditable.
 */
export function useNotTodayTypingAlert(
  containerRef: RefObject<HTMLElement | null>,
  options: NotTodayTypingAlertOptions,
): void {
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  })
  const alertedVisitRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }
    const onBeforeInput = (event: Event): void => {
      const { notToday, visitKey, dayLabel, onGoToday } = optionsRef.current
      if (!notToday || alertedVisitRef.current === visitKey) {
        return
      }
      if (!(event instanceof InputEvent) || !event.inputType.startsWith('insert')) {
        return
      }
      alertedVisitRef.current = visitKey
      toast.warning('This isn’t today’s note', {
        id: NOT_TODAY_TOAST_ID,
        description: `You’re writing in ${dayLabel}.`,
        action: { label: 'Go to today', onClick: onGoToday },
      })
    }
    container.addEventListener('beforeinput', onBeforeInput)
    return () => {
      container.removeEventListener('beforeinput', onBeforeInput)
    }
  }, [containerRef])

  useEffect(() => {
    if (!options.notToday) {
      toast.dismiss(NOT_TODAY_TOAST_ID)
    }
  }, [options.notToday])
}
