import { useState, type ReactElement } from 'react'
import { AUTO_LOCK_MINUTES_OPTIONS, autoLockMinutesSchema, type AutoLockMinutes } from '@dayjot/core'
import {
  AppLockPasswordDialog,
  type AppLockPasswordIntent,
} from '@/components/app-lock/app-lock-password-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppLock } from '@/providers/app-lock-provider'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'
import { SettingsSection } from './section'

const NEVER_VALUE = 'never'

const AUTO_LOCK_LABELS: Record<NonNullable<AutoLockMinutes>, string> = {
  1: '1 minute',
  5: '5 minutes',
  15: '15 minutes',
  30: '30 minutes',
  60: '1 hour',
  120: '2 hours',
}

function selectValueFor(minutes: AutoLockMinutes): string {
  return minutes === null ? NEVER_VALUE : String(minutes)
}

function minutesFor(value: string): AutoLockMinutes {
  return autoLockMinutesSchema.parse(value === NEVER_VALUE ? null : Number(value))
}

/**
 * Settings → App lock: the password and the auto-lock delay. The password lives
 * in the shell, not the settings document, so its row changes through a dialog
 * instead of applying live; the delay is an ordinary setting, and means nothing
 * until a password exists.
 */
export function AppLockSection(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const { configured } = useAppLock()
  const [intent, setIntent] = useState<AppLockPasswordIntent | null>(null)

  return (
    <SettingsSection id="app-lock">
      <SettingsField
        legend="Password"
        description="Ask for a password to open DayJot. This covers the app only: your notes stay readable as Markdown files on this Mac."
      >
        <div className="mt-3 flex items-center gap-2">
          {configured ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIntent('change')}
              >
                Change password
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-text-muted"
                onClick={() => setIntent('remove')}
              >
                Remove password
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setIntent('set')}>
              Set password
            </Button>
          )}
        </div>
      </SettingsField>
      <SettingsField
        legend="Auto-lock"
        description="Lock after this long without typing or moving the pointer."
      >
        <div className="mt-3">
          <Select
            value={selectValueFor(settings.autoLockMinutes)}
            disabled={!configured}
            onValueChange={(value) => updateSettings({ autoLockMinutes: minutesFor(value) })}
          >
            <SelectTrigger aria-label="Auto-lock" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_LOCK_MINUTES_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {AUTO_LOCK_LABELS[minutes]}
                </SelectItem>
              ))}
              <SelectItem value={NEVER_VALUE}>Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsField>
      {intent !== null ? (
        <AppLockPasswordDialog intent={intent} onClose={() => setIntent(null)} />
      ) : null}
    </SettingsSection>
  )
}
