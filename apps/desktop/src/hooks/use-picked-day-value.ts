import { useEffect, useState } from 'react'

// How long a just-picked value outranks the index before the index's word is
// final again — a save that never lands must not leave the control lying.
// Generous on purpose: index refetches are throttled (`query-client.ts`), so
// a healthy save can take a few seconds to come back as a row.
const PICKED_TIMEOUT_MS = 10_000

/** What {@link usePickedDayValue} reports for one day. */
export interface PickedDayValue<Value> {
  /** The day's value as shown — a just-picked one until the index agrees. */
  value: Value
  /** Show `value` at once, ahead of the save → re-index round trip. */
  showPicked: (value: Value) => void
  /** Drop a pick whose write failed, so the index speaks for the day again. */
  forgetPicked: () => void
}

interface Picked<Value> {
  date: string
  value: Value
  /** What the index said when the pick was made. */
  indexedAtPick: Value
}

/**
 * A daily-note control's value, with the index as the source of truth — it
 * sees edits from sync, other windows, and the file itself alike — and a
 * value picked in the control shown immediately until the index catches up.
 * The pick yields once the index agrees with it, or reports anything new
 * since the pick (a later edit the control never saw), or after a timeout.
 */
export function usePickedDayValue<Value>(date: string, indexed: Value): PickedDayValue<Value> {
  const [picked, setPicked] = useState<Picked<Value> | null>(null)

  // Adjusted during render: the pick has done its job — and the index speaks
  // for the day again — once the index agrees with it, or reports anything
  // new since the pick (a later edit it never saw, from this window or not).
  if (
    picked !== null &&
    (picked.date !== date ||
      Object.is(indexed, picked.value) ||
      !Object.is(indexed, picked.indexedAtPick))
  ) {
    setPicked(null)
  }

  useEffect(() => {
    if (picked === null) {
      return
    }
    const timer = setTimeout(() => setPicked(null), PICKED_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [picked])

  const pending = picked !== null && picked.date === date ? picked : null
  return {
    value: pending === null ? indexed : pending.value,
    showPicked: (value) => setPicked({ date, value, indexedAtPick: indexed }),
    forgetPicked: () => setPicked(null),
  }
}
