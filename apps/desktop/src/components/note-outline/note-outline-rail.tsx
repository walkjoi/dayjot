import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import type { OutlineEntry } from './outline-entries'
import { useNoteOutline } from './use-note-outline'

/**
 * Tick width per outline depth (title/H1 longest → deep headings shortest),
 * so the shape of the note is legible without reading a label. Depths past
 * the array flatten onto the last width.
 */
const TICK_WIDTHS_PX = [16, 11, 7, 5]

/**
 * How far (px) the flyout slides back over its trigger: the trigger's full
 * width (16px widest tick + 6px padding each side), so the flyout's right
 * edge lands where the ticks' right edge was — it replaces them in place.
 */
const TRIGGER_OVERLAP_PX = 28

/**
 * A heading's indent step in the rail: depth relative to the note's
 * shallowest heading, so a note titled with an H1 and sectioned with H2s
 * reads as two levels — and one written entirely in H2s still starts flush.
 */
function outlineDepth(entry: OutlineEntry, minLevel: number): number {
  return Math.min(entry.level - minLevel, TICK_WIDTHS_PX.length - 1)
}

/**
 * The note outline rail (single-note views): a quiet stack of tick marks in
 * the pane's right gutter, one per heading, the section being read accented.
 * Hovering (or focusing) the ticks expands a flyout listing the headings —
 * the settings navigator's hairline-and-sliding-marker anatomy — and
 * clicking one scrolls its section to the top of the pane without moving
 * the editor caret.
 *
 * Renders inside the note's `ScrollRestored` container as a full-height
 * strip so the sticky centering and `findScrollContainer` both resolve
 * against the right scroller. The rail removes itself when it can't earn
 * its place: under two headings, a pane narrower than 50rem (the
 * `@container` gate), or the `editorShowOutline` setting
 * turned off (Settings → Editor, or ⌥⌘O).
 */
export function NoteOutlineRail(): ReactElement | null {
  const { settings } = useSettings()
  const enabled = settings.editorShowOutline
  const stripRef = useRef<HTMLElement | null>(null)
  const { entries, activeIndex, jumpTo } = useNoteOutline(stripRef, enabled)

  const [open, setOpen] = useState(false)
  // Hover-opens must not move focus (the caret stays in the editor, on open
  // *and* on close); keyboard/click opens keep Radix's focus handling.
  const openedByHover = useRef(false)
  const closeTimer = useRef(0)
  const cancelScheduledClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
  }, [])
  // The 100ms grace lets the pointer cross from the ticks onto the flyout
  // (they overlap, but a diagonal exit must not slam the flyout shut).
  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 100)
  }, [])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // The sliding accent marker is measurement output, not React state: the
  // layout effect positions the DOM node directly, before paint, from the
  // active item's box (the same slide the settings navigator renders).
  const markerRef = useRef<HTMLSpanElement | null>(null)
  const itemRefs = useRef(new Map<number, HTMLButtonElement>())
  useLayoutEffect(() => {
    const marker = markerRef.current
    if (!open || marker === null) {
      return
    }
    const item = itemRefs.current.get(activeIndex)
    if (!item || item.offsetHeight === 0) {
      marker.style.display = 'none'
      return
    }
    marker.style.display = ''
    marker.style.transform = `translateY(${item.offsetTop}px)`
    marker.style.height = `${item.offsetHeight}px`
  }, [open, activeIndex, entries])

  if (!enabled) {
    return null
  }

  const minLevel = entries.length > 0 ? Math.min(...entries.map((entry) => entry.level)) : 1

  return (
    <nav
      ref={stripRef}
      aria-label="Note outline"
      // The strip spans the pane's full height so the sticky child can pin
      // to the scrollport's center; pointer events stay off so right-gutter
      // clicks keep focusing the editor. Ticks fold away below 50rem of
      // pane width (`@container` on the note's scroll container).
      className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-11 @min-[50rem]:block"
    >
      {entries.length >= 2 ? (
        <div className="sticky top-1/2 h-0">
          <div className="flex -translate-y-1/2 justify-end pr-3">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger
                aria-label="Note outline"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') {
                    openedByHover.current = true
                    cancelScheduledClose()
                    setOpen(true)
                  }
                }}
                onPointerLeave={scheduleClose}
                onClick={(event) => {
                  // Already hover-opened: a click must not toggle the flyout
                  // shut under the pointer.
                  if (open) {
                    event.preventDefault()
                  } else {
                    openedByHover.current = false
                  }
                }}
                className={cn(
                  'pointer-events-auto flex flex-col items-end gap-2 rounded-md px-1.5 py-3',
                  'opacity-55 transition-opacity duration-100 hover:opacity-100',
                  'outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50',
                  'data-[state=open]:opacity-0',
                )}
              >
                {entries.map((entry, index) => (
                  <span
                    key={index}
                    aria-hidden
                    className={cn(
                      'h-0.5 rounded-full transition-colors duration-100',
                      index === activeIndex ? 'bg-accent' : 'bg-text-muted',
                    )}
                    style={{ width: `${TICK_WIDTHS_PX[outlineDepth(entry, minLevel)]}px` }}
                  />
                ))}
              </PopoverTrigger>
              <PopoverContent
                side="left"
                align="center"
                sideOffset={-TRIGGER_OVERLAP_PX}
                collisionPadding={8}
                onOpenAutoFocus={(event) => {
                  if (openedByHover.current) {
                    event.preventDefault()
                  }
                }}
                onCloseAutoFocus={(event) => {
                  if (openedByHover.current) {
                    event.preventDefault()
                  }
                }}
                onPointerEnter={cancelScheduledClose}
                onPointerLeave={scheduleClose}
                className="max-h-96 w-64 overflow-y-auto p-2"
              >
                <div className="relative flex min-w-0 flex-col border-l border-border">
                  <span
                    ref={markerRef}
                    aria-hidden
                    style={{ display: 'none' }}
                    className="absolute -left-px top-0 w-0.5 rounded-full bg-accent transition-[transform,height] duration-200 ease-out motion-reduce:transition-none"
                  />
                  {entries.map((entry, index) => (
                    <button
                      key={index}
                      type="button"
                      ref={(node) => {
                        if (node) {
                          itemRefs.current.set(index, node)
                        } else {
                          itemRefs.current.delete(index)
                        }
                      }}
                      aria-current={index === activeIndex ? 'location' : undefined}
                      onClick={() => jumpTo(index)}
                      className={cn(
                        'truncate rounded-r-md py-1 pr-2 text-left text-[13px] outline-none transition-colors duration-100',
                        'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/50',
                        index === activeIndex || entry.isTitle
                          ? 'text-text'
                          : 'text-text-secondary hover:text-text',
                        entry.isTitle && 'font-medium',
                      )}
                      style={{ paddingLeft: `${16 + outlineDepth(entry, minLevel) * 12}px` }}
                    >
                      {entry.text}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
