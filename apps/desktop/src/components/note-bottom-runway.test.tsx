import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerNoteEditorHandle,
  unregisterNoteEditorHandle,
} from '@/editor/editor-handle-registry'
import type { NoteEditorHandle } from '@/editor/note-editor'
import { NoteBottomRunway } from './note-bottom-runway'

function stubHandle(): NoteEditorHandle {
  return {
    getMarkdown: () => '',
    setMarkdown: vi.fn(),
    insertMarkdown: vi.fn(),
    focus: vi.fn(),
    setSelection: vi.fn(),
    getSelectedText: () => '',
    openSelectionMenu: vi.fn(),
    startPendingReplacement: () => false,
    appendPendingReplacementText: vi.fn(),
    acceptPendingReplacement: vi.fn(),
    discardPendingReplacement: vi.fn(),
  }
}

describe('NoteBottomRunway', () => {
  const path = 'daily/2026-08-05.md'
  const handle = stubHandle()

  afterEach(() => {
    unregisterNoteEditorHandle(path, handle)
  })

  it('lands the caret at the end of the note when clicked', () => {
    registerNoteEditorHandle(path, handle)
    const view = render(<NoteBottomRunway path={path} />)
    const runway = view.container.querySelector('.dayjot-bottom-runway')
    expect(runway).not.toBeNull()

    const prevented = !fireEvent.mouseDown(runway as Element)

    expect(handle.focus).toHaveBeenCalled()
    expect(handle.setSelection).toHaveBeenCalledWith('end')
    // Default-prevented, so the press never blurs the editor.
    expect(prevented).toBe(true)
    view.unmount()
  })

  it('is inert while no editor is mounted for the note', () => {
    const view = render(<NoteBottomRunway path={path} />)
    const runway = view.container.querySelector('.dayjot-bottom-runway')
    expect(() => fireEvent.mouseDown(runway as Element)).not.toThrow()
    view.unmount()
  })
})
