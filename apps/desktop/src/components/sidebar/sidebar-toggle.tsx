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
 * The sidebar toggle, pinned to **one window position in both states** —
 * right of the macOS traffic lights inside the title-bar band (the band's
 * left edge without the overlay). The sidebar slides away underneath it;
 * only the glyph and label flip, so switching modes never makes the control
 * jump (the native Finder/Notes pattern). The sidebar hosts it while
 * expanded and the note pane hosts it while collapsed — same coordinates,
 * exactly one on screen. Absolute against the hosting region, which starts
 * at the window's left edge in both cases; `window-drag-control` keeps its
 * clicks from starting a window drag inside the band. The same state is on
 * `⌘\`.
 */
export function SidebarToggle(): ReactElement {
  const { sidebarCollapsed, toggleSidebar } = useSidebar()
  const label = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const Icon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <div
      className={cn(
        'window-drag-control absolute',
        hasMacosTitleBarOverlay ? 'left-[4.75rem] top-[3px]' : 'left-2 top-0.5',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={toggleSidebar}
            className={BUTTON_CLASS}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {label} {TOGGLE_BINDING && <ShortcutKeys binding={TOGGLE_BINDING} />}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
