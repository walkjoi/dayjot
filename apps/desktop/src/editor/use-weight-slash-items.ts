import { useCallback } from 'react'
import type { SlashMenuItem, SlashMenuSearchHandler } from '@meowdown/react'
import type { NoteEditorHandle } from './note-editor'

/**
 * The editor's `/` menu row for logging weight: inserts `weight:: ` and
 * leaves the caret at the value position. Deliberately absent from the
 * empty-query browse list — the row only appears once the user starts typing
 * its name (`/w`, `/we`, …), so the feature stays invisible to anyone who
 * doesn't know it. The indexer picks the finished `weight:: 72.5` line up
 * from the saved markdown; the Stats page charts it.
 *
 * `getEditor` is read at select time, not capture time, like the template
 * rows: a late resolve after the pane unmounted must insert nowhere.
 */
export function useWeightSlashItems(
  getEditor: () => NoteEditorHandle | null,
): SlashMenuSearchHandler {
  return useCallback(
    (query: string): SlashMenuItem[] => {
      const typed = query.trim().toLowerCase()
      if (typed === '' || !'weight'.startsWith(typed)) {
        return []
      }
      return [
        {
          id: 'stats:weight',
          label: 'Weight',
          detail: 'weight:: …kg',
          onSelect: () => {
            const editor = getEditor()
            if (editor === null) {
              return
            }
            editor.insertMarkdown('weight:: ')
            editor.focus()
          },
        },
      ]
    },
    [getEditor],
  )
}
