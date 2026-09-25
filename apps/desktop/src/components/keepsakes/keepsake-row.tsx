import { useRef, useState, type MouseEvent, type ReactElement } from 'react'
import { Bookmark } from 'lucide-react'
import type { Keepsake } from '@dayjot/core'
import type { WikilinkClickHandler } from '@meowdown/core'
import { MarkdownView } from '@meowdown/react'
import { useOpenExternalLink } from '@/editor/open-external-link'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { cn } from '@/lib/utils'
import { keepsakeDayLabel } from './keepsake-months'
import { useOverflows } from './use-overflows'

interface KeepsakeRowProps {
  keepsake: Keepsake
  /** The Markdown to show — under a subject heading, without the link it repeats. */
  markdown: string
  /** Open the note the keepsake was written in, landed on the keepsake itself. */
  onOpen: (keepsake: Keepsake, event: NewWindowClickEvent) => void
  /** Navigate a `[[wiki link]]` written in the keepsake. Pass a stable function. */
  onWikilinkClick: WikilinkClickHandler
  /** Resolve `![…](…)` sources to displayable URLs. Pass a stable function. */
  resolveImageUrl: (src: string) => string | undefined
}

// What a click inside the fragment activates on its own — never a jump.
const INTERACTIVE_SELECTOR = 'a, button, input, .md-link, .md-atom-view-preview'

/**
 * One keepsake, rendered as rich text in the note font at reading size: a
 * kept line reads as its words, a kept section keeps its lists and code. A
 * long section rests clamped with a "Show all", so one big keep can't bury
 * the rest of the box.
 *
 * A click on the words — or on the day beneath them, the keyboard's way in —
 * opens the note the keepsake was written in, with the caret on it. Links in
 * the fragment stay links, and a drag that selects text never jumps.
 */
export function KeepsakeRow({
  keepsake,
  markdown,
  onOpen,
  onWikilinkClick,
  resolveImageUrl,
}: KeepsakeRowProps): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const overflows = useOverflows(bodyRef, !expanded)
  const openExternalLink = useOpenExternalLink()
  const dayLabel = keepsakeDayLabel(keepsake)

  const openFromBody = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) !== null) {
      return
    }
    if ((window.getSelection()?.toString() ?? '') !== '') {
      return
    }
    onOpen(keepsake, event)
  }

  return (
    <li className="group grid grid-cols-[0.75rem_minmax(0,1fr)] items-start gap-3 border-b border-border py-4 last:border-b-0">
      <Bookmark
        aria-hidden
        strokeWidth={1.75}
        className="mt-1.5 size-3 flex-none text-accent/45 transition-colors group-hover:text-accent"
      />
      <div className="min-w-0">
        <div
          ref={bodyRef}
          onClick={openFromBody}
          className={cn(
            'dayjot-keepsake-body max-w-[56ch] cursor-pointer text-[0.95rem] text-text',
            !expanded && 'dayjot-keepsake-body-clamped',
            !expanded && overflows && 'dayjot-keepsake-body-faded',
          )}
        >
          <MarkdownView
            className="dayjot-editor"
            markdown={markdown}
            expandCollapsed
            onWikilinkClick={onWikilinkClick}
            onLinkClick={openExternalLink}
            resolveImageUrl={resolveImageUrl}
          />
        </div>
        {overflows && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 cursor-pointer text-xs font-medium text-text-secondary transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none"
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <button
            type="button"
            onClick={(event) => onOpen(keepsake, event)}
            aria-label={`Open where it was kept, ${dayLabel}`}
            className="cursor-pointer transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
          >
            {dayLabel}
          </button>
          {keepsake.dailyDate === null && <span className="truncate">{keepsake.noteTitle}</span>}
        </div>
      </div>
    </li>
  )
}
