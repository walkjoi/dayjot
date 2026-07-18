import type { ReactElement } from 'react'
import { RebuildIndexField } from './rebuild-index-field'
import { SettingsSection } from './section'

/** The search settings: the index rebuild action. */
export function SearchSection(): ReactElement {
  return (
    <SettingsSection id="search">
      <RebuildIndexField />
    </SettingsSection>
  )
}
