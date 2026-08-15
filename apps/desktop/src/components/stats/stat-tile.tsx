import type { ReactElement } from 'react'

interface StatTileProps {
  label: string
  value: string
  /** Small print under the value (e.g. a unit), when the label alone is not enough. */
  detail?: string
}

/** One headline number on the Stats page, in the house card idiom. */
export function StatTile({ label, value, detail }: StatTileProps): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="truncate text-xs text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text">{value}</div>
      {detail !== undefined && <div className="mt-0.5 text-xs text-text-muted">{detail}</div>}
    </div>
  )
}
