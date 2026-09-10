import type { ReactElement } from 'react'
import { Bookmark } from 'lucide-react'
import type { Keepsake } from '@dayjot/core'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { keepsakeDayLabel } from './keepsake-months'

interface KeepsakeRowProps {
  keepsake: Keepsake
  /** Open the day (or note) the fragment was written in. */
  onOpenSource: (keepsake: Keepsake, event: NewWindowClickEvent) => void
  /** Open a subject written on the fragment's line. */
  onOpenLink: (target: string, event: NewWindowClickEvent) => void
}

/**
 * One kept fragment. The text is already plain — the parse strips the list
 * marker, the `#keep` token, and the Markdown syntax — so it renders as the
 * words themselves, at reading size, in the note font.
 *
 * The wiki links written on the line show as quiet subject chips. They are
 * free (the links were in the sentence and already indexed) and entirely
 * optional: a fragment that links to nothing is a complete keepsake.
 */
export function KeepsakeRow({ keepsake, onOpenSource, onOpenLink }: KeepsakeRowProps): ReactElement {
  return (
    <li className="group grid grid-cols-[0.75rem_minmax(0,1fr)] items-start gap-3 border-b border-border py-4 last:border-b-0">
      <Bookmark
        aria-hidden
        strokeWidth={1.75}
        className="mt-1.5 size-3 flex-none text-accent/45 transition-colors group-hover:text-accent"
      />
      <div className="min-w-0">
        <button
          type="button"
          onClick={(event) => onOpenSource(keepsake, event)}
          className="dayjot-keepsake-text block w-full max-w-[56ch] cursor-pointer text-left text-[0.95rem] text-text transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
        >
          {keepsake.text}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <span>{keepsakeDayLabel(keepsake)}</span>
          {keepsake.dailyDate === null && <span className="truncate">{keepsake.noteTitle}</span>}
          {keepsake.links.map((target) => (
            <button
              key={target}
              type="button"
              onClick={(event) => onOpenLink(target, event)}
              className="cursor-pointer font-medium text-accent/80 transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
            >
              {target}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
