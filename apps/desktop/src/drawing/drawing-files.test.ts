import { describe, expect, it } from 'vitest'
import {
  drawingBlockMarkdown,
  newDrawingId,
  newPreviewRevision,
  parseDrawingPreviewSource,
  previewAssetPath,
  sceneAssetPath,
} from './drawing-files'

describe('drawing file naming', () => {
  it('round-trips a preview path back to its scene', () => {
    const drawingId = newDrawingId()
    const preview = previewAssetPath(drawingId, newPreviewRevision())

    const parsed = parseDrawingPreviewSource(preview)

    expect(parsed).toEqual({ drawingId, scenePath: sceneAssetPath(drawingId) })
  })

  it('mints ids in the lowercase ulid alphabet', () => {
    expect(newDrawingId()).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/)
  })

  it('embeds the preview as a plain markdown image block', () => {
    expect(drawingBlockMarkdown('assets/drawings/x-1.png')).toBe(
      '![Drawing](assets/drawings/x-1.png)',
    )
  })

  it('rejects sources that are not drawing previews', () => {
    const drawingId = newDrawingId()
    for (const src of [
      'assets/pasted-123.png',
      `assets/drawings/${drawingId}.png`,
      `assets/drawings/${drawingId}-1.jpg`,
      `assets/drawings/${drawingId}.excalidraw`,
      `assets/drawings/../${drawingId}-1.png`,
      `notes/drawings/${drawingId}-1.png`,
      `https://example.com/assets/drawings/${drawingId}-1.png`,
    ]) {
      expect(parseDrawingPreviewSource(src)).toBeNull()
    }
  })
})
