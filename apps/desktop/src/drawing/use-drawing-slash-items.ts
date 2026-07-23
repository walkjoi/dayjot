import { useCallback } from 'react'
import type { SlashMenuItem, SlashMenuSearchHandler } from '@meowdown/react'

/**
 * The editor's `/` menu row for drawings: one "Drawing" item that mints a
 * new drawing and enters drawing mode immediately (`use-note-drawings.ts`).
 * meowdown filters against the label/keywords, so `/draw`, `/sketch`, and
 * `/whiteboard` all land here.
 */
export function useDrawingSlashItems(openNewDrawing: () => void): SlashMenuSearchHandler {
  return useCallback(
    (_query: string): SlashMenuItem[] => [
      {
        id: 'drawing:new',
        label: 'Drawing',
        keywords: ['draw', 'sketch', 'whiteboard', 'canvas', 'excalidraw'],
        onSelect: openNewDrawing,
      },
    ],
    [openNewDrawing],
  )
}
