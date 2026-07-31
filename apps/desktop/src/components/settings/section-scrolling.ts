import { findScrollContainer } from '@/lib/scroll-container'
import { settingsSectionDomId, type SettingsSectionId } from './sections'

/**
 * Breathing room (px) left above a section's heading when jumping to it —
 * matches the settings page's `py-8` so a jumped-to heading sits exactly
 * where the page's own top padding would put it.
 */
export const SECTION_JUMP_OFFSET_PX = 32

/**
 * Scrolls the settings page so the given section's heading lands just below
 * the container's top edge. `anchor` is any element inside the settings
 * scroll container (the navigator passes its own node). Smooth unless the OS
 * asks for reduced motion.
 */
export function scrollToSettingsSection(anchor: HTMLElement, id: SettingsSectionId): void {
  const target = document.getElementById(settingsSectionDomId(id))
  const container = findScrollContainer(anchor)
  if (!target || !container) {
    return
  }
  const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
  const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
  container.scrollTo({
    top: Math.max(0, container.scrollTop + offset - SECTION_JUMP_OFFSET_PX),
    behavior,
  })
}
