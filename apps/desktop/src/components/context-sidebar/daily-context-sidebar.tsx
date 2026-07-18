import type { ReactElement } from 'react'
import { dailyPath } from '@dayjot/core'
import { DailyEventsSection } from './daily-events-section'
import { PublishedUrlSection } from './published-url-section'

interface DailyContextSidebarProps {
  /** The day the sidebar describes — a validated ISO date from the route. */
  date: string
}

/**
 * A daily note's contextual sidebar: the day's meetings (Apple Calendar) and
 * its share link. Both sections self-hide when empty, and the workspace omits
 * this whole panel when neither applies (see `useContextPanel`) — so an
 * ordinary day is a clean single column. Day navigation now lives in the left
 * sidebar's calendar, and inbound links sit under the note itself. Rendered in
 * the AppShell's right region on daily routes that have events or a share link.
 */
export function DailyContextSidebar({ date }: DailyContextSidebarProps): ReactElement {
  return (
    <div className="flex flex-col py-2 text-text">
      <div className="my-4 space-y-4 pb-4">
        <DailyEventsSection date={date} />
        <PublishedUrlSection path={dailyPath(date)} />
      </div>
    </div>
  )
}
