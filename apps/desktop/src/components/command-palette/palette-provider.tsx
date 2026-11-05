import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useModalRegistration } from '@/lib/open-modals'

/**
 * Palette open/query state (Plan 08), provided once per workspace so both the
 * ⌘K command (via CommandContext.openPalette) and the `search/:query` route
 * can open the same surface. The palette is modal but not built on the shared
 * `Dialog`, so it joins the open-modal registry here, where its state lives.
 */

interface PaletteContextValue {
  open: boolean
  query: string
  openPalette: (query?: string) => void
  setQuery: (query: string) => void
  closePalette: () => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function PaletteProvider({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useModalRegistration(open)

  const openPalette = useCallback((initialQuery?: string) => {
    setQuery(initialQuery ?? '')
    setOpen(true)
  }, [])
  const closePalette = useCallback(() => {
    setOpen(false)
  }, [])

  const value = useMemo<PaletteContextValue>(
    () => ({ open, query, openPalette, setQuery, closePalette }),
    [open, query, openPalette, closePalette],
  )
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>
}

export function usePalette(): PaletteContextValue {
  const context = useContext(PaletteContext)
  if (!context) {
    throw new Error('usePalette must be used within a PaletteProvider')
  }
  return context
}
