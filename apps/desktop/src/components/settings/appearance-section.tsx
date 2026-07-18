import type { ReactElement } from 'react'
import {
  dateFormatSchema,
  timeFormatSchema,
  weekStartDaySchema,
  type DateFormat,
  type ThemePreference,
  type TimeFormat,
  type WeekStartDay,
} from '@dayjot/core'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatFullDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'
import { SettingsOptionCard } from './option-card'
import { SettingsSection } from './section'

interface ThemeOption {
  value: ThemePreference
  label: string
  icon: LucideIcon
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

interface TimeFormatOption {
  value: TimeFormat
  label: string
}

interface WeekStartOption {
  value: WeekStartDay
  label: string
}

const TIME_FORMAT_OPTIONS: TimeFormatOption[] = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
]

const WEEK_START_OPTIONS: WeekStartOption[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
]

// The options demonstrate themselves: each shows today's date in its format,
// so the day/month order is visible rather than described.
const DATE_FORMAT_VALUES: DateFormat[] = ['mdy', 'dmy', 'iso']

/**
 * How DayJot looks: the theme picker (radio cards, the original app's idiom)
 * plus the date/time display formats, which feed every date and time the app
 * renders (via `formatDayLabel`/`formatTimeOfDay` in `lib/dates.ts`) —
 * display-only, so switching them never touches stored timestamps or
 * daily-note keys. Edits the settings document directly — the ThemeProvider
 * applies whatever is persisted, so this section needs no theme context of
 * its own.
 */
export function AppearanceSection(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const today = new Date()

  return (
    <SettingsSection id="appearance">
      <SettingsField
        legend="Theme"
        description="System follows your OS appearance. Saved with your settings."
      >
        <div className="mt-3 grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const selected = settings.theme === value
            return (
              <SettingsOptionCard
                key={value}
                selected={selected}
                className={cn(
                  'flex-col items-center gap-1.5 px-3 py-3',
                  selected ? 'text-accent-soft-text' : 'text-text-secondary',
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={selected}
                  onChange={() => updateSettings({ theme: value })}
                  className="sr-only"
                />
                <Icon aria-hidden strokeWidth={1.75} className="size-4" />
                <span className="text-xs font-medium">{label}</span>
              </SettingsOptionCard>
            )
          })}
        </div>
      </SettingsField>
      <SettingsField
        legend="Date format"
        description="The style for dates shown throughout DayJot, including daily note titles."
      >
        <div className="mt-3">
          <Select
            value={settings.dateFormat}
            onValueChange={(value) => updateSettings({ dateFormat: dateFormatSchema.parse(value) })}
          >
            <SelectTrigger aria-label="Date format" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatFullDate(today, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsField>
      <SettingsField
        legend="Time format"
        description="How times are shown throughout DayJot — 8:22pm or 20:22."
      >
        <div className="mt-3">
          <Select
            value={settings.timeFormat}
            onValueChange={(value) => updateSettings({ timeFormat: timeFormatSchema.parse(value) })}
          >
            <SelectTrigger aria-label="Time format" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_FORMAT_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsField>
      <SettingsField
        legend="Start week on"
        description="The first day shown in calendars."
      >
        <div className="mt-3">
          <Select
            value={settings.weekStartDay}
            onValueChange={(value) =>
              updateSettings({ weekStartDay: weekStartDaySchema.parse(value) })
            }
          >
            <SelectTrigger aria-label="Start week on" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_START_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsField>
    </SettingsSection>
  )
}
