import { describe, expect, it } from 'vitest'
import {
  extractOutlineEntries,
  headingDisplayText,
  outlineEntriesEqual,
} from './outline-entries'

/** A `.dayjot-note-surface` stand-in with the given block markup. */
function editorRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'dayjot-note-surface'
  root.innerHTML = html
  return root
}

describe('headingDisplayText', () => {
  it('strips hidden markdown syntax marks', () => {
    // mark-mode "hide" keeps the `# ` prefix in the DOM as an .md-mark span.
    const root = editorRoot('<h2><span class="md-mark">## </span>行程 Itinerary</h2>')
    expect(headingDisplayText(root.firstElementChild!)).toBe('行程 Itinerary')
  })

  it('strips inline marks and collapses whitespace', () => {
    const root = editorRoot(
      '<h3>Day 1 ·\n <strong><span class="md-mark">**</span>浅草<span class="md-mark">**</span></strong></h3>',
    )
    expect(headingDisplayText(root.firstElementChild!)).toBe('Day 1 · 浅草')
  })
})

describe('extractOutlineEntries', () => {
  it('lists headings in document order with their levels', () => {
    const root = editorRoot(
      '<h1>东京五日</h1><p>intro</p><h2>行程</h2><h3>Day 1</h3><p>text</p><h2>预算</h2>',
    )
    const entries = extractOutlineEntries(root)
    expect(entries.map((entry) => [entry.level, entry.text])).toEqual([
      [1, '东京五日'],
      [2, '行程'],
      [3, 'Day 1'],
      [2, '预算'],
    ])
  })

  it('marks only the leading H1 as the title', () => {
    const root = editorRoot('<h1>Title</h1><h2>Section</h2><h1>Another H1</h1>')
    const entries = extractOutlineEntries(root)
    expect(entries.map((entry) => entry.isTitle)).toEqual([true, false, false])
  })

  it('does not treat a mid-document H1 as the title', () => {
    const root = editorRoot('<p>lead</p><h1>Not a title</h1>')
    expect(extractOutlineEntries(root).map((entry) => entry.isTitle)).toEqual([false])
  })

  it('skips headings with no visible text', () => {
    // An empty seeded title (ghost "Untitled") and a bare `## ` being typed
    // have nothing to point at.
    const root = editorRoot(
      '<h1></h1><h2><span class="md-mark">## </span></h2><h2>Kept</h2>',
    )
    expect(extractOutlineEntries(root).map((entry) => entry.text)).toEqual(['Kept'])
  })

  it('finds headings nested in other blocks', () => {
    const root = editorRoot('<blockquote><h2>Quoted</h2></blockquote>')
    expect(extractOutlineEntries(root).map((entry) => entry.text)).toEqual(['Quoted'])
  })
})

describe('outlineEntriesEqual', () => {
  it('treats re-extractions of an unchanged document as equal', () => {
    const root = editorRoot('<h1>Title</h1><h2>Section</h2>')
    expect(outlineEntriesEqual(extractOutlineEntries(root), extractOutlineEntries(root))).toBe(
      true,
    )
  })

  it('detects text and structure changes', () => {
    const root = editorRoot('<h1>Title</h1><h2>Section</h2>')
    const before = extractOutlineEntries(root)
    root.querySelector('h2')!.textContent = 'Renamed'
    expect(outlineEntriesEqual(before, extractOutlineEntries(root))).toBe(false)
  })
})
