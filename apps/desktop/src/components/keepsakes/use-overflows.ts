import { useEffect, useState, type RefObject } from 'react'

/**
 * Whether `ref`'s content is taller than its box — a clamped keepsake that has
 * more to show. Measured only while `measuring` (the clamp is on); the answer
 * holds while it is off, so the "Show less" that undoes an expansion stays.
 * Re-measures as the content settles (fonts, images) through a ResizeObserver,
 * and reports false where none exists.
 */
export function useOverflows(ref: RefObject<HTMLElement | null>, measuring: boolean): boolean {
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!measuring || element === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = (): void => setOverflows(element.scrollHeight > element.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of element.children) {
      observer.observe(child)
    }
    measure()
    return () => observer.disconnect()
  }, [ref, measuring])

  return overflows
}
