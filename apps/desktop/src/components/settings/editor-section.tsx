import type { ReactElement } from 'react'
import type { EditorFont, EditorMarkdownSyntax, EditorTextSize } from '@dayjot/core'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'
import { KeyboardShortcutsField } from './keyboard-shortcuts-field'
import { SettingsOptionCard } from './option-card'
import { SettingsSection } from './section'
import { SettingsSwitchField } from './switch-field'
import { TimestampField } from './timestamp-field'

interface MarkdownSyntaxOption {
  value: EditorMarkdownSyntax
  label: string
  description: string
}

const MARKDOWN_SYNTAX_OPTIONS: MarkdownSyntaxOption[] = [
  {
    value: 'hide',
    label: 'Hide',
    description: 'Always hidden',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Only around the cursor',
  },
  {
    value: 'show',
    label: 'Show',
    description: 'Always visible',
  },
]

interface TextSizeOption {
  value: EditorTextSize
  label: string
  description: string
}

const TEXT_SIZE_OPTIONS: TextSizeOption[] = [
  {
    value: 'small',
    label: 'Small',
    description: 'Compact',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Default',
  },
  {
    value: 'large',
    label: 'Large',
    description: 'Comfortable',
  },
]

interface NoteFontOption {
  value: EditorFont
  label: string
  description: string
}

const NOTE_FONT_OPTIONS: NoteFontOption[] = [
  {
    value: 'wenkai',
    label: '霞鹜文楷 LXGW WenKai',
    description: 'Default · handwritten kaiti',
  },
  {
    value: 'source-han-serif',
    label: '思源宋体 Source Han Serif',
    description: 'Bookish serif',
  },
  {
    value: 'literata',
    label: 'Literata',
    description: 'Reading serif · system Chinese',
  },
  {
    value: 'quattro',
    label: 'iA Writer Quattro',
    description: 'Writer’s duospace · system Chinese',
  },
  {
    value: 'inter',
    label: 'Inter',
    description: 'Matches the interface',
  },
]

export function EditorSection(): ReactElement {
  const { settings, updateSettings } = useSettings()

  return (
    <SettingsSection id="editor">
      <SettingsField
        legend="Markdown syntax"
        description="How literal markdown characters (**, `, etc.) are displayed while editing."
      >
        <div className="mt-3 @container">
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
            {MARKDOWN_SYNTAX_OPTIONS.map((option) => {
              const selected = settings.editorMarkdownSyntax === option.value
              return (
                <SettingsOptionCard
                  key={option.value}
                  selected={selected}
                  className="items-start justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        selected && 'text-accent-soft-text',
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {option.description}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="editor-markdown-syntax"
                    value={option.value}
                    checked={selected}
                    onChange={() => updateSettings({ editorMarkdownSyntax: option.value })}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                </SettingsOptionCard>
              )
            })}
          </div>
        </div>
      </SettingsField>

      <SettingsField
        legend="Text size"
        description="The reading size of the note editor."
      >
        <div className="mt-3 @container">
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
            {TEXT_SIZE_OPTIONS.map((option) => {
              const selected = settings.editorTextSize === option.value
              return (
                <SettingsOptionCard
                  key={option.value}
                  selected={selected}
                  className="items-start justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        selected && 'text-accent-soft-text',
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {option.description}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="editor-text-size"
                    value={option.value}
                    checked={selected}
                    onChange={() => updateSettings({ editorTextSize: option.value })}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                </SettingsOptionCard>
              )
            })}
          </div>
        </div>
      </SettingsField>

      <SettingsField
        legend="Note font"
        description="The typeface notes are written and read in. Every choice covers Chinese and English."
      >
        <div className="mt-3 @container">
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            {NOTE_FONT_OPTIONS.map((option) => {
              const selected = settings.editorFont === option.value
              return (
                <SettingsOptionCard
                  key={option.value}
                  selected={selected}
                  className="items-start justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        selected && 'text-accent-soft-text',
                      )}
                    >
                      {option.label}
                    </span>
                    {/* The card previews its own face: the sample line reads
                        through the same stack the editor would switch to. */}
                    <span
                      className="mt-1 block truncate text-base"
                      style={{ fontFamily: `var(--font-reading-${option.value})` }}
                    >
                      晨间日记 · Morning notes
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {option.description}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="editor-font"
                    value={option.value}
                    checked={selected}
                    onChange={() => updateSettings({ editorFont: option.value })}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                </SettingsOptionCard>
              )
            })}
          </div>
        </div>
      </SettingsField>

      <SettingsSwitchField
        legend="Full-width notes"
        description="Stretch note text across the window with a small edge margin."
        checked={settings.editorFullWidth}
        onCheckedChange={(checked) => updateSettings({ editorFullWidth: checked })}
      />

      <SettingsSwitchField
        legend="Spell check"
        description="Underline misspelled words while you type."
        checked={settings.editorSpellCheck}
        onCheckedChange={(checked) => updateSettings({ editorSpellCheck: checked })}
      />

      <SettingsSwitchField
        legend="Start with a bullet"
        description="New and empty notes open with a single bullet point, ready to type."
        checked={settings.editorDefaultBullet}
        onCheckedChange={(checked) => updateSettings({ editorDefaultBullet: checked })}
      />

      <SettingsSwitchField
        legend="Bullet after a heading"
        description="Pressing Return at the end of a heading starts a new bullet."
        checked={settings.editorBulletAfterHeading}
        onCheckedChange={(checked) => updateSettings({ editorBulletAfterHeading: checked })}
      />

      <SettingsSwitchField
        legend="Smooth caret animation"
        description="Animate the text cursor as it moves while editing."
        checked={settings.editorSmoothCaretAnimation}
        onCheckedChange={(checked) => updateSettings({ editorSmoothCaretAnimation: checked })}
      />

      <TimestampField />
      <KeyboardShortcutsField />
    </SettingsSection>
  )
}
