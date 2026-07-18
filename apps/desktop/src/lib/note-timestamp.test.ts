import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteEditorHandle } from '@/editor/note-editor'
import {
  registerNoteEditorHandle,
  unregisterNoteEditorHandle,
} from '@/editor/editor-handle-registry'
import type { CommandContext } from '@/lib/commands/types'
import { DEFAULT_TIMESTAMP_FORMAT, insertTimestamp, renderTimestamp } from './note-timestamp'

function fakeHandle(): NoteEditorHandle & { inserted: string[] } {
  const inserted: string[] = []
  return {
    inserted,
    getMarkdown: () => '',
    setMarkdown: () => {},
    insertMarkdown: (markdown: string) => {
      inserted.push(markdown)
    },
    focus: vi.fn(),
    moveCaretToEdge: () => {},
  } as unknown as NoteEditorHandle & { inserted: string[] }
}

function contextFor(
  notePath: string | null,
  format: string = DEFAULT_TIMESTAMP_FORMAT,
): CommandContext {
  return { notePath: () => notePath, timestampFormat: () => format } as unknown as CommandContext
}

const registered: Array<{ path: string; handle: NoteEditorHandle }> = []

function mount(path: string, handle: NoteEditorHandle): void {
  registerNoteEditorHandle(path, handle)
  registered.push({ path, handle })
}

afterEach(() => {
  for (const { path, handle } of registered.splice(0)) {
    unregisterNoteEditorHandle(path, handle)
  }
})

describe('renderTimestamp', () => {
  const at = new Date(2026, 6, 17, 14, 5, 9)

  it('renders the default list-line shape, zero-padded 24-hour', () => {
    expect(renderTimestamp(DEFAULT_TIMESTAMP_FORMAT, at)).toBe('- 14:05 ')
    expect(renderTimestamp(DEFAULT_TIMESTAMP_FORMAT, new Date(2026, 6, 17, 0, 0))).toBe(
      '- 00:00 ',
    )
    expect(renderTimestamp(DEFAULT_TIMESTAMP_FORMAT, new Date(2026, 6, 17, 23, 59))).toBe(
      '- 23:59 ',
    )
  })

  it('supports 12-hour, seconds, and AM/PM tokens', () => {
    expect(renderTimestamp('h:mm A — ', at)).toBe('2:05 PM — ')
    expect(renderTimestamp('hh:mm:ss a', at)).toBe('02:05:09 pm')
    expect(renderTimestamp('h a', new Date(2026, 6, 17, 0, 30))).toBe('12 am')
    expect(renderTimestamp('H:mm', new Date(2026, 6, 17, 9, 7))).toBe('9:07')
  })

  it('passes non-token text through literally — tokens only match standalone', () => {
    expect(renderTimestamp('## HH:mm — ', at)).toBe('## 14:05 — ')
    expect(renderTimestamp('> logged at HH:mm', at)).toBe('> logged at 14:05')
    expect(renderTimestamp('hash', at)).toBe('hash')
  })
})

describe('insertTimestamp', () => {
  it('inserts the configured format at the routed note’s caret and refocuses', () => {
    const handle = fakeHandle()
    mount('daily/2026-07-17.md', handle)

    insertTimestamp(
      contextFor('daily/2026-07-17.md', '[h:mm a] '),
      new Date(2026, 6, 17, 15, 42),
    )

    expect(handle.inserted).toEqual(['[3:42 pm] '])
    expect(handle.focus).toHaveBeenCalledTimes(1)
  })

  it('no-ops without a routed note', () => {
    const handle = fakeHandle()
    mount('notes/a.md', handle)

    insertTimestamp(contextFor(null), new Date(2026, 6, 17, 15, 42))

    expect(handle.inserted).toEqual([])
  })

  it('no-ops when the routed note has no mounted editor', () => {
    expect(() =>
      insertTimestamp(contextFor('notes/unmounted.md'), new Date(2026, 6, 17, 15, 42)),
    ).not.toThrow()
  })
})
