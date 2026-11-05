import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

/**
 * Open state for the template surfaces:
 * the "Insert template…" picker and the "New template" name dialog — provided
 * once per workspace so the palette commands (via CommandContext) and the
 * dialogs themselves share one definition of "open", the same shape as the
 * shortcuts provider. One value, not a flag per dialog, so the two can never
 * be open together.
 */

/** The open template surface; at most one at a time. */
type TemplateSurface = 'picker' | 'create'

interface NoteTemplatesContextValue {
  pickerOpen: boolean
  createOpen: boolean
  openTemplatePicker: () => void
  closeTemplatePicker: () => void
  openTemplateCreate: () => void
  closeTemplateCreate: () => void
}

const NoteTemplatesContext = createContext<NoteTemplatesContextValue | null>(null)

export function NoteTemplatesProvider({ children }: { children: ReactNode }): ReactElement {
  const [openSurface, setOpenSurface] = useState<TemplateSurface | null>(null)

  const openTemplatePicker = useCallback(() => {
    setOpenSurface('picker')
  }, [])
  // Each close only closes its own surface: a late close from the one just
  // replaced must not dismiss the other.
  const closeTemplatePicker = useCallback(() => {
    setOpenSurface((current) => (current === 'picker' ? null : current))
  }, [])
  const openTemplateCreate = useCallback(() => {
    setOpenSurface('create') // replaces the picker, whose empty state chains here
  }, [])
  const closeTemplateCreate = useCallback(() => {
    setOpenSurface((current) => (current === 'create' ? null : current))
  }, [])

  const value = useMemo<NoteTemplatesContextValue>(
    () => ({
      pickerOpen: openSurface === 'picker',
      createOpen: openSurface === 'create',
      openTemplatePicker,
      closeTemplatePicker,
      openTemplateCreate,
      closeTemplateCreate,
    }),
    [
      openSurface,
      openTemplatePicker,
      closeTemplatePicker,
      openTemplateCreate,
      closeTemplateCreate,
    ],
  )
  return <NoteTemplatesContext.Provider value={value}>{children}</NoteTemplatesContext.Provider>
}

export function useNoteTemplates(): NoteTemplatesContextValue {
  const context = useContext(NoteTemplatesContext)
  if (!context) {
    throw new Error('useNoteTemplates must be used within a NoteTemplatesProvider')
  }
  return context
}
