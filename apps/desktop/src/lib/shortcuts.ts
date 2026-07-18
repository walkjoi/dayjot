import { EDITOR_BINDING_DESCRIPTIONS } from '@/editor/keymap'
import { APP_COMMANDS, keybindingFor } from '@/lib/commands/app-commands'

/** One row of a shortcuts listing: a binding and what it does. */
export interface Shortcut {
  binding: string
  description: string
}

/**
 * Both keymap scopes, straight from their registries — never hand-listed, so
 * the ⌘/ cheat-sheet and the Keyboard settings section can't drift from the
 * bindings that actually fire.
 */
/** Computed per call so user keybinding overrides are always current. */
export function appShortcuts(): Shortcut[] {
  return APP_COMMANDS.flatMap((command) => {
    const binding = keybindingFor(command.id)
    return binding ? [{ binding, description: command.title }] : []
  })
}

export const EDITOR_SHORTCUTS: Shortcut[] = Object.entries(EDITOR_BINDING_DESCRIPTIONS).map(
  ([binding, description]) => ({ binding, description }),
)
