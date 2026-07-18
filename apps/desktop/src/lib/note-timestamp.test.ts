import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteEditorHandle } from '@/editor/note-editor'
import {
  registerNoteEditorHandle,
  unregisterNoteEditorHandle,
} from '@/editor/editor-handle-registry'
import type { CommandContext } from '@/lib/commands/types'
import { insertTimestamp, timestampLine } from './note-timestamp'

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

function contextFor(notePath: string | null): CommandContext {
  return { notePath: () => notePath } as unknown as CommandContext
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

describe('timestampLine', () => {
  it('formats 24-hour local time as a list line, zero-padded', () => {
    expect(timestampLine(new Date(2026, 6, 17, 14, 5))).toBe('- 14:05 ')
    expect(timestampLine(new Date(2026, 6, 17, 9, 30))).toBe('- 09:30 ')
    expect(timestampLine(new Date(2026, 6, 17, 0, 0))).toBe('- 00:00 ')
    expect(timestampLine(new Date(2026, 6, 17, 23, 59))).toBe('- 23:59 ')
  })
})

describe('insertTimestamp', () => {
  it('inserts the timestamp line at the routed note’s caret and refocuses', () => {
    const handle = fakeHandle()
    mount('daily/2026-07-17.md', handle)

    insertTimestamp(contextFor('daily/2026-07-17.md'), new Date(2026, 6, 17, 15, 42))

    expect(handle.inserted).toEqual(['- 15:42 '])
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
