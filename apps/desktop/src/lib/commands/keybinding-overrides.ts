/**
 * User keybinding overrides for app commands (today: the Insert-timestamp
 * shortcut, Settings → Editor). Command definitions keep their defaults —
 * this module-level store overlays them, and both dispatch
 * (`app-shortcuts.ts`) and display (`keybindingFor`) consult it, so a
 * remapped chord fires and is advertised consistently while its default
 * stops doing either.
 *
 * Module-level rather than React state for the same reason as the editor
 * handle registry: writes come from a settings-watching effect and reads
 * from keydown dispatch, neither of which needs re-renders.
 */

interface KeybindingOverride {
  /** The user's binding, in the app keymap grammar. */
  binding: string
  /** The command's built-in default, suppressed while the override holds. */
  defaultBinding: string
}

const overrides = new Map<string, KeybindingOverride>()

/**
 * Set (or clear) `commandId`'s override. A binding equal to the default —
 * or empty — clears, so "reset to default" and "never customized" are the
 * same state.
 */
export function setCommandKeybindingOverride(
  commandId: string,
  binding: string,
  defaultBinding: string,
): void {
  if (binding === '' || binding === defaultBinding) {
    overrides.delete(commandId)
    return
  }
  overrides.set(commandId, { binding, defaultBinding })
}

/** The user's binding for `commandId`, or null when the default applies. */
export function commandKeybindingOverride(commandId: string): string | null {
  return overrides.get(commandId)?.binding ?? null
}

/** The command a user-overridden `binding` fires, or null. */
export function overrideCommandIdForBinding(binding: string): string | null {
  for (const [commandId, override] of overrides) {
    if (override.binding === binding) {
      return commandId
    }
  }
  return null
}

/** Whether `binding` is a default that an override has remapped away. */
export function isSuppressedDefaultBinding(binding: string): boolean {
  for (const override of overrides.values()) {
    if (override.defaultBinding === binding) {
      return true
    }
  }
  return false
}

/** Test hook: back to a clean slate. */
export function resetKeybindingOverridesForTests(): void {
  overrides.clear()
}
