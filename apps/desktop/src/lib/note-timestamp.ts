import { noteEditorHandleFor } from '@/editor/editor-handle-registry'
import type { CommandContext } from '@/lib/commands/types'

/** The built-in format — a `- HH:mm ` list line, the interstitial-journaling shape. */
export const DEFAULT_TIMESTAMP_FORMAT = '- HH:mm '

/**
 * Render a timestamp format for `at`, in local time. Tokens (longest match
 * first): `HH`/`H` 24-hour padded/plain, `hh`/`h` 12-hour padded/plain,
 * `mm` minutes, `ss` seconds, `A`/`a` AM/PM upper/lower. Tokens only match
 * standalone (not inside words), so literal text like "at" or "Logged"
 * passes through untouched.
 */
export function renderTimestamp(format: string, at: Date): string {
  const hours24 = at.getHours()
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const pad = (value: number): string => String(value).padStart(2, '0')
  const tokens: Record<string, string> = {
    HH: pad(hours24),
    H: String(hours24),
    hh: pad(hours12),
    h: String(hours12),
    mm: pad(at.getMinutes()),
    ss: pad(at.getSeconds()),
    A: hours24 < 12 ? 'AM' : 'PM',
    a: hours24 < 12 ? 'am' : 'pm',
  }
  return format.replace(
    /(?<![A-Za-z])(?:HH|hh|mm|ss|H|h|A|a)(?![A-Za-z])/g,
    (token) => tokens[token] ?? token,
  )
}

/**
 * The Insert timestamp command: render the configured format for now and
 * drop it at the caret of the routed note's editor, then focus the editor so
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
  handle.insertMarkdown(renderTimestamp(context.timestampFormat(), at))
  handle.focus()
}
