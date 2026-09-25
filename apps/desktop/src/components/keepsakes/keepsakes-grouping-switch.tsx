import type { ReactElement } from 'react'
import type { KeepsakesGrouping } from '@dayjot/core'
import { FilterTab } from '@/components/all-notes/filter-tab'

interface KeepsakesGroupingSwitchProps {
  grouping: KeepsakesGrouping
  onChange: (grouping: KeepsakesGrouping) => void
}

/**
 * The Keepsakes view's one control: divide the box by month or by subject.
 * The same segmented look as the All Notes filter group — a view switch, not
 * a filter: every keepsake shows either way.
 */
export function KeepsakesGroupingSwitch({
  grouping,
  onChange,
}: KeepsakesGroupingSwitchProps): ReactElement {
  return (
    <div
      role="group"
      aria-label="Group keepsakes by"
      className="flex items-stretch divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
    >
      <FilterTab label="Months" active={grouping === 'month'} onClick={() => onChange('month')} />
      <FilterTab
        label="Subjects"
        active={grouping === 'subject'}
        onClick={() => onChange('subject')}
      />
    </div>
  )
}
