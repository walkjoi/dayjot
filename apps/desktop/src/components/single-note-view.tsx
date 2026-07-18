import type { ReactElement, ReactNode } from 'react'
import { NotePane } from '@/components/note-pane'
import { NotePinButton } from '@/components/note-pin-button'
import { NoteTrashAction } from '@/components/context-sidebar/note-trash-action'
import { ScrollRestored } from '@/routing/scroll-restore'

interface SingleNoteViewProps {
  /** Graph-relative path of the note filling this view. */
  path: string
  /**
   * Chrome rendered above the pane inside the scrolling column — the note
   * window's day label, standing in for the title a daily doesn't carry.
   */
  heading?: ReactNode
}

/**
 * One note filling the viewport: the note route's layout, shared with the
 * secondary note window (which renders dailies this way too). The vertical
 * padding lives on the inner column — not the scroll container — so
 * `min-h-full` fills the viewport exactly, and the flex chain stretches the
 * editor over any leftover space. The reading gutter is the editor's own
 * padding, so clicking anywhere in the note body (blank side margins
 * included) focuses it.
 */
export function SingleNoteView({ path, heading }: SingleNoteViewProps): ReactElement {
  return (
    <ScrollRestored className="h-full overflow-auto px-0">
      <div className="relative mx-auto flex min-h-full w-full max-w-full flex-col py-8">
        {/* The routed note is the focused note, so its actions are always
            on screen: the pin (the old note-actions panel, relocated) and,
            for regular notes, trash (the component hides itself for
            dailies). */}
        <div className="absolute right-4 top-3 z-10 flex items-center gap-1">
          <NotePinButton path={path} />
          <NoteTrashAction path={path} variant="icon" />
        </div>
        {heading}
        <NotePane
          path={path}
          lazy
          autoFocus
          className="flex grow flex-col"
          gutterClassName="dayjot-content-gutter"
          editorClassName="grow"
        />
      </div>
    </ScrollRestored>
  )
}
