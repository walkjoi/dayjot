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
 * Side-panel visibility state, provided once per workspace so the shell
 * (which renders or hides the two aside regions), the sidebar's own collapse
 * button, and the command registry (`⌘\` / `⌘⇧\`) share one source of truth.
 * The panels collapse independently: the left workspace sidebar and the
 * right context panel each keep their own flag. Session-only by design — a
 * relaunch starts expanded.
 */

interface SidebarContextValue {
  /** The left workspace sidebar (navigation, pins, graph switcher). */
  sidebarCollapsed: boolean
  /** The right context panel (calendar, backlinks). */
  contextCollapsed: boolean
  toggleSidebar: () => void
  toggleContextPanel: () => void
  /**
   * The "just me and the page" gesture: collapses both panels in one step,
   * and restores both when everything is already hidden. Any mixed state
   * collapses — the intent is a bare canvas, not a strict toggle.
   */
  toggleFocusMode: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }): ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [contextCollapsed, setContextCollapsed] = useState(false)
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => !current)
  }, [])
  const toggleContextPanel = useCallback(() => {
    setContextCollapsed((current) => !current)
  }, [])
  const toggleFocusMode = useCallback(() => {
    const expand = sidebarCollapsed && contextCollapsed
    setSidebarCollapsed(!expand)
    setContextCollapsed(!expand)
  }, [sidebarCollapsed, contextCollapsed])

  const value = useMemo<SidebarContextValue>(
    () => ({
      sidebarCollapsed,
      contextCollapsed,
      toggleSidebar,
      toggleContextPanel,
      toggleFocusMode,
    }),
    [sidebarCollapsed, contextCollapsed, toggleSidebar, toggleContextPanel, toggleFocusMode],
  )
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

/** Access side-panel visibility + the toggles. Use within a SidebarProvider. */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
