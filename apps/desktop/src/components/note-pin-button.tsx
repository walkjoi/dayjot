import type { ReactElement } from 'react'
import { PinIcon } from '@/components/icons/pin-icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNoteRow } from '@/hooks/use-note-row'
import { usePinnedNotes } from '@/hooks/use-pinned-notes'
import { keybindingFor } from '@/lib/commands/app-commands'
import { toggleNotePinned } from '@/lib/note-pin'
import { useOptimisticPinToggle } from '@/lib/notes/use-optimistic-pin-toggle'
import { startOperation } from '@/lib/operations'
import { errorMessage } from '@dayjot/core'
import { useGraph } from '@/providers/graph-provider'
import { cn } from '@/lib/utils'

interface NotePinButtonProps {
  /** Graph-relative path of the note the pin operates on. */
  path: string
  className?: string
}

/**
 * The header pin: the note-actions panel's pin toggle relocated next to the
 * note itself (Plan 08's `note.togglePin` stays its keyboard twin). Reflects
 * the same pinned query as the sidebar's Pinned section, bridged by the
 * optimistic overlay while the watcher catches up; a pinned note keeps its
 * pin visible, an unpinned one only surfaces it while its container reveals
 * it (focus/hover — the caller decides via `className`).
 */
export function NotePinButton({ path, className }: NotePinButtonProps): ReactElement {
  const { graph } = useGraph()
  const isPinned = usePinnedNotes().some((note) => note.path === path)
  const noteRow = useNoteRow(path)
  const { applyOptimisticPin, invalidateOptimisticPin } = useOptimisticPinToggle(path, noteRow)
  const binding = keybindingFor('note.togglePin')

  async function toggle(): Promise<void> {
    const generation = graph?.generation
    if (generation === undefined) {
      return
    }
    applyOptimisticPin(!isPinned)
    try {
      await toggleNotePinned(path, generation)
    } catch (cause) {
      invalidateOptimisticPin()
      startOperation('Updating pin').fail(errorMessage(cause))
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={isPinned ? 'Un-pin this note' : 'Pin this note'}
          aria-pressed={isPinned}
          className={cn(
            'flex size-7 items-center justify-center rounded-md transition-colors duration-100',
            isPinned
              ? 'text-accent hover:bg-surface-hover'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
            className,
          )}
        >
          <PinIcon width={16} height={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isPinned ? 'Un-pin this note' : 'Pin this note'}
        {binding !== null ? ` (${binding.replace('Mod-', '⌘').toUpperCase()})` : ''}
      </TooltipContent>
    </Tooltip>
  )
}
