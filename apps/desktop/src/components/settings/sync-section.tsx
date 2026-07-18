import type { ReactElement } from 'react'
import { BackupSettingsField } from './backup-section'
import { IcloudSettingsField } from './icloud-section'
import { SettingsSection } from './section'

/**
 * Settings → Sync: GitHub sync leads (the default backup path) and iCloud
 * Drive follows. Keep both controls visible so an iCloud-hosted graph can
 * still manage its GitHub sync.
 */
export function SyncSection(): ReactElement {
  return (
    <SettingsSection id="sync">
      <BackupSettingsField />
      <IcloudSettingsField />
    </SettingsSection>
  )
}
