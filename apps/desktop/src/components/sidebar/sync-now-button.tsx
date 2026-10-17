import type { ReactElement } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSync } from '@/providers/sync-provider'

/**
 * A footer shortcut for a full sync cycle (commit → pull/merge → push), so
 * another device's edits can be pulled without refocusing the window. Only a
 * graph with a running backup shows it — local history and secondary note
 * windows have nothing to pull. The icon spins while any cycle runs; a click
 * mid-cycle still queues a full follow-up.
 */
export function SyncNowButton(): ReactElement | null {
  const { backup, backUpNow } = useSync()
  if (backup.phase !== 'connected') {
    return null
  }
  const syncing = backup.status.state === 'syncing'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Sync now"
          onClick={() => void backUpNow()}
          className="size-7 shrink-0 text-text-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-secondary"
        >
          <RefreshCw
            aria-hidden
            strokeWidth={1.75}
            className={cn('size-4', syncing && 'motion-safe:animate-spin')}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sync now</TooltipContent>
    </Tooltip>
  )
}
