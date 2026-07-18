import { afterEach, describe, expect, it } from 'vitest'
import {
  commandKeybindingOverride,
  isSuppressedDefaultBinding,
  overrideCommandIdForBinding,
  resetKeybindingOverridesForTests,
  setCommandKeybindingOverride,
} from './keybinding-overrides'

afterEach(() => {
  resetKeybindingOverridesForTests()
})

describe('keybinding overrides', () => {
  it('overlays a custom binding and suppresses the default', () => {
    setCommandKeybindingOverride('note.insertTimestamp', 'Alt-Mod-t', 'Mod-Shift-t')

    expect(commandKeybindingOverride('note.insertTimestamp')).toBe('Alt-Mod-t')
    expect(overrideCommandIdForBinding('Alt-Mod-t')).toBe('note.insertTimestamp')
    expect(isSuppressedDefaultBinding('Mod-Shift-t')).toBe(true)
  })

  it('treats the default (or empty) as cleared — reset and untouched are the same state', () => {
    setCommandKeybindingOverride('note.insertTimestamp', 'Alt-Mod-t', 'Mod-Shift-t')
    setCommandKeybindingOverride('note.insertTimestamp', 'Mod-Shift-t', 'Mod-Shift-t')

    expect(commandKeybindingOverride('note.insertTimestamp')).toBeNull()
    expect(overrideCommandIdForBinding('Alt-Mod-t')).toBeNull()
    expect(isSuppressedDefaultBinding('Mod-Shift-t')).toBe(false)

    setCommandKeybindingOverride('note.insertTimestamp', '', 'Mod-Shift-t')
    expect(commandKeybindingOverride('note.insertTimestamp')).toBeNull()
  })
})
