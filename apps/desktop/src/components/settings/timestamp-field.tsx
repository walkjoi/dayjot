import { useState, type ReactElement } from 'react'
import { DEFAULT_SETTINGS } from '@dayjot/core'
import { defaultKeybindingFor, keybindingFor } from '@/lib/commands/app-commands'
import { renderTimestamp } from '@/lib/note-timestamp'
import { appShortcuts } from '@/lib/shortcuts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'

/** `⌘` on the binding grammar's own terms — matches the shortcuts dialog. */
function prettyBinding(binding: string): string {
  return binding
    .replace('Alt-', '⌥')
    .replace('Mod-', '⌘')
    .replace('Meta-', '⌘')
    .replace('Ctrl-', '⌃')
    .replace('Shift-', '⇧')
    .toUpperCase()
}

/** Compose the app keymap grammar from a captured keydown, or null. */
function bindingFromEvent(event: React.KeyboardEvent): string | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null
  }
  const key = event.key.toLowerCase()
  if (key.length !== 1 || !/[a-z0-9[\]\\/,.;'`=-]/.test(key)) {
    return null
  }
  const alt = event.altKey ? 'Alt-' : ''
  const shift = event.shiftKey ? 'Shift-' : ''
  return `${alt}Mod-${shift}${key}`
}

/**
 * Settings → Editor → Insert timestamp: the format template (rendered live
 * against the current time) and the shortcut, captured by pressing the new
 * chord while the capture button is focused. A chord already bound to
 * another command is refused with the owning command named.
 */
export function TimestampField(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const [recording, setRecording] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const binding = keybindingFor('note.insertTimestamp') ?? settings.timestampKeybinding
  const defaultBinding = defaultKeybindingFor('note.insertTimestamp') ?? 'Mod-Shift-t'
  const preview = renderTimestamp(settings.timestampFormat, new Date())

  function capture(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      setRecording(false)
      setCaptureError(null)
      return
    }
    const next = bindingFromEvent(event)
    if (next === null) {
      return // wait for a full chord (must include ⌘/Ctrl)
    }
    event.preventDefault()
    event.stopPropagation()
    const taken = appShortcuts().find(
      (shortcut) => shortcut.binding === next && shortcut.description !== 'Insert timestamp',
    )
    if (taken !== undefined) {
      setCaptureError(`${prettyBinding(next)} is already used by “${taken.description}”.`)
      return
    }
    updateSettings({ timestampKeybinding: next })
    setRecording(false)
    setCaptureError(null)
  }

  return (
    <SettingsField
      legend="Insert timestamp"
      description="The Markdown dropped at the cursor. Tokens: HH/H (24-hour), hh/h (12-hour), mm, ss, A/a."
    >
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-3">
          <Input
            aria-label="Timestamp format"
            value={settings.timestampFormat}
            className="max-w-56 font-mono"
            onChange={(event) => {
              const value = event.target.value
              if (value.length > 0) {
                updateSettings({ timestampFormat: value })
              }
            }}
          />
          <span className="truncate text-xs text-text-muted">
            Inserts: <code className="rounded bg-muted px-1.5 py-0.5">{preview}</code>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">Shortcut</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Change timestamp shortcut"
            onKeyDown={recording ? capture : undefined}
            onClick={() => {
              setRecording((current) => !current)
              setCaptureError(null)
            }}
            onBlur={() => setRecording(false)}
          >
            {recording ? 'Press keys…' : prettyBinding(binding)}
          </Button>
          {binding !== defaultBinding ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-text-muted"
              onClick={() => {
                updateSettings({
                  timestampKeybinding: DEFAULT_SETTINGS.timestampKeybinding,
                })
                setCaptureError(null)
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>
        {captureError !== null ? (
          <p className="text-xs text-destructive">{captureError}</p>
        ) : null}
      </div>
    </SettingsField>
  )
}
