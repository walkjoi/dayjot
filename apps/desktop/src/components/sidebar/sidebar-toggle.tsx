import type { ReactElement } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { ShortcutKeys } from '@/components/shortcut-keys'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { keybindingFor } from '@/lib/commands/app-commands'
import { hasMacosTitleBarOverlay } from '@/lib/window-chrome'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/providers/sidebar-provider'

const TOGGLE_BINDING = keybindingFor('sidebar.toggle')

const BUTTON_CLASS =
  'rounded-md p-1 text-text-muted transition-colors duration-100 ' +
  'hover:bg-surface-hover hover:text-text'

/**
 * Collapses the workspace sidebar — lives in the sidebar's top row, beside
 * the history arrows (and, like them, inside the overlaid macOS title-bar
 * band, so `window-drag-control` keeps its clicks from starting a window
 * drag). The same state is on `⌘\`; while collapsed,
 * {@link SidebarExpandButton} floats in the note pane to bring it back.
 */
export function SidebarCollapseButton(): ReactElement {
  const { toggleSidebar } = useSidebar()
  return (
    <div className="window-drag-control flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={toggleSidebar}
            className={BUTTON_CLASS}
          >
            <PanelLeftClose aria-hidden className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Collapse sidebar {TOGGLE_BINDING && <ShortcutKeys binding={TOGGLE_BINDING} />}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * Reopens the collapsed workspace sidebar — floats at the top-left of the
 * note pane (rendered only while the sidebar is hidden, so exactly one
 * toggle is on screen at a time). With the overlaid macOS title bar the
 * pane's top-left corner belongs to the traffic lights, so the button
 * shifts right of them, inside the title-bar band.
 */
export function SidebarExpandButton(): ReactElement {
  const { toggleSidebar } = useSidebar()
  return (
    <div
      className={cn(
        'window-drag-control absolute',
        hasMacosTitleBarOverlay ? 'left-[4.75rem] top-[3px]' : 'left-2 top-2',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={toggleSidebar}
            className={BUTTON_CLASS}
          >
            <PanelLeftOpen aria-hidden className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Expand sidebar {TOGGLE_BINDING && <ShortcutKeys binding={TOGGLE_BINDING} />}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
