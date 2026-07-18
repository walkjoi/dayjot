import { noteEditorHandleFor } from '@/editor/editor-handle-registry'
import type { CommandContext } from '@/lib/commands/types'

/**
 * The inserted line for `at`, in 24-hour local time: `- HH:mm` — a list item,
 * the interstitial-journaling shape (a bullet per moment, prose typed after
 * the time).
 */
export function timestampLine(at: Date): string {
  const hours = String(at.getHours()).padStart(2, '0')
  const minutes = String(at.getMinutes()).padStart(2, '0')
  return `- ${hours}:${minutes} `
}

/**
 * The Insert timestamp command: drop the current time at the caret of the
 * routed note's editor as a `- HH:mm` list line, then focus the editor so
 * typing continues right after it. Resolves the editor through the handle
 * registry exactly like Attach file…, so the insertion can never land in a
 * different note than the one note-scoped commands describe. No-ops without
 * a routed note or a mounted editor.
 */
export function insertTimestamp(context: CommandContext, at: Date = new Date()): void {
  const notePath = context.notePath()
  if (notePath === null) {
    return
  }
  const handle = noteEditorHandleFor(notePath)
  if (handle === null) {
    return
  }
  handle.insertMarkdown(timestampLine(at))
  handle.focus()
}
