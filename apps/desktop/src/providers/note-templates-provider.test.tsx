import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NoteTemplatesProvider, useNoteTemplates } from './note-templates-provider'

afterEach(() => {
  cleanup()
})

function templatesHook() {
  return renderHook(() => useNoteTemplates(), { wrapper: NoteTemplatesProvider })
}

describe('NoteTemplatesProvider', () => {
  it('opening either surface replaces the other', () => {
    const { result } = templatesHook()

    act(() => result.current.openTemplatePicker())
    act(() => result.current.openTemplateCreate()) // the picker's empty state chains here
    expect(result.current).toMatchObject({ pickerOpen: false, createOpen: true })

    act(() => result.current.openTemplatePicker())
    expect(result.current).toMatchObject({ pickerOpen: true, createOpen: false })
  })

  it('a close only closes its own surface', () => {
    const { result } = templatesHook()
    act(() => result.current.openTemplateCreate())

    act(() => result.current.closeTemplatePicker()) // a late close from the replaced picker
    expect(result.current.createOpen).toBe(true)

    act(() => result.current.closeTemplateCreate())
    expect(result.current).toMatchObject({ pickerOpen: false, createOpen: false })
  })
})
