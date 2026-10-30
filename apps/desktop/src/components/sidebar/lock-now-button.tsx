import type { ReactElement } from 'react'
import { Lock } from 'lucide-react'
import { ShortcutKeys } from '@/components/shortcut-keys'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { keybindingFor } from '@/lib/commands/app-commands'
import { runCommand } from '@/lib/commands/registry'
import type { CommandContext } from '@/lib/commands/types'
import { useAppLock } from '@/providers/app-lock-provider'

const LOCK_BINDING = keybindingFor('app.lock')

interface LockNowButtonProps {
  /** Commands run with this — the same context the palette/shortcuts use. */
  context: CommandContext
}

/** A footer shortcut for locking the app; shows once a password exists. */
export function LockNowButton({ context }: LockNowButtonProps): ReactElement | null {
  const { configured } = useAppLock()
  if (!configured) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Lock DayJot"
          onClick={() => void runCommand('app.lock', context)}
          className="size-7 shrink-0 text-text-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-secondary"
        >
          <Lock aria-hidden strokeWidth={1.75} className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Lock DayJot {LOCK_BINDING && <ShortcutKeys binding={LOCK_BINDING} />}
      </TooltipContent>
    </Tooltip>
  )
}
