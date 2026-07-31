/**
 * The nearest ancestor that actually scrolls. Used instead of
 * `Element.scrollIntoView`, which walks the whole ancestor chain and can
 * permanently nudge `overflow: hidden` boxes like the workspace frame —
 * scrolling the one container that owns the view's overflow keeps the rest
 * of the layout pinned. Shared by the settings navigator and the note
 * outline rail, which both scroll-jump within a `ScrollRestored` container.
 */
export function findScrollContainer(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent
    }
  }
  return null
}
