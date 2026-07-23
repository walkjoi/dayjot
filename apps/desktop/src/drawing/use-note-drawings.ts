import { useCallback, useMemo, useState } from 'react'
import { errorMessage } from '@dayjot/core'
import type { NoteEditorHandle } from '@/editor/note-editor'
import { startOperation } from '@/lib/operations'
import {
  drawingBlockMarkdown,
  newDrawingId,
  newPreviewRevision,
  parseDrawingPreviewSource,
  previewAssetPath,
  sceneAssetPath,
  writeDrawingPreview,
  writeDrawingScene,
} from './drawing-files'
import type { DrawingModeRequest, DrawingSnapshot } from './drawing-session'

export interface UseNoteDrawingsOptions {
  /** Graph session drawings read and write against. */
  generation: number | null
  /** This pane's live editor, resolved at use time (never captured stale). */
  getEditor: () => NoteEditorHandle | null
  /**
   * Rewrite the note's markdown through the save pipeline (the preview-source
   * swap after an edit session). Receives the current markdown, returns the
   * next; an identical return must be a no-op for the caller.
   */
  applyMarkdown: (mutate: (markdown: string) => string) => void
}

/** One note pane's drawing feature: state for the dialog plus its handlers. */
export interface NoteDrawings {
  /** The open drawing-mode session, or null when the canvas is closed. */
  request: DrawingModeRequest | null
  /** `/draw`: mint a drawing and enter the canvas immediately. */
  openNewDrawing: () => void
  /**
   * Claim an image click when it is a drawing preview (re-entering the
   * canvas); false routes the click on to the ordinary image lightbox.
   */
  claimImageClick: (src: string) => boolean
  /** Draft scene persistence during the session (debounced by the canvas). */
  saveSceneDraft: (sceneJson: string) => void
  /** Drawing mode closed; persist the outcome and update the note. */
  exitDrawing: (snapshot: DrawingSnapshot | null) => void
}

/**
 * Drawing blocks for one note pane (whiteboard UX spec, option A + block
 * presentation). A drawing lives as `assets/drawings/<id>.excalidraw` with a
 * revisioned PNG preview beside it; the note embeds the preview as a plain
 * markdown image. Create inserts that block at the cursor on exit; edit
 * writes a *new* preview revision and swaps the image source in the
 * markdown — the editor is uncontrolled, so a fresh source (not an
 * overwritten file) is what makes the block re-render. Scene files are never
 * deleted here: a deleted block must stay ⌘Z-restorable, and stale preview
 * revisions back exactly that.
 */
export function useNoteDrawings({
  generation,
  getEditor,
  applyMarkdown,
}: UseNoteDrawingsOptions): NoteDrawings {
  const [request, setRequest] = useState<DrawingModeRequest | null>(null)

  const openNewDrawing = useCallback(() => {
    const drawingId = newDrawingId()
    setRequest({ kind: 'create', drawingId, scenePath: sceneAssetPath(drawingId) })
  }, [])

  const claimImageClick = useCallback((src: string): boolean => {
    const parsed = parseDrawingPreviewSource(src)
    if (parsed === null) {
      return false
    }
    setRequest({
      kind: 'edit',
      drawingId: parsed.drawingId,
      scenePath: parsed.scenePath,
      previewSource: src,
    })
    return true
  }, [])

  const saveSceneDraft = useCallback(
    (sceneJson: string) => {
      if (request === null || generation === null) {
        return
      }
      writeDrawingScene(request.scenePath, sceneJson, generation).catch((cause: unknown) => {
        console.error('drawing draft save failed:', errorMessage(cause))
      })
    },
    [request, generation],
  )

  const exitDrawing = useCallback(
    (snapshot: DrawingSnapshot | null) => {
      const active = request
      setRequest(null)
      if (active === null || snapshot === null || generation === null) {
        return
      }
      if (!snapshot.changedSinceOpen) {
        return
      }
      void (async () => {
        await writeDrawingScene(active.scenePath, snapshot.sceneJson, generation)
        if (snapshot.empty) {
          // Nothing visible to render: a new drawing inserts no block; an
          // emptied existing block keeps its last preview (the scene file
          // itself is empty, so re-entering shows the truth).
          return
        }
        const previewPath = previewAssetPath(active.drawingId, newPreviewRevision())
        // The exporter lives in the lazy Excalidraw chunk, which is already
        // loaded — the canvas just closed.
        const { exportPreviewBlob } = await import('./drawing-canvas')
        await writeDrawingPreview(previewPath, await exportPreviewBlob(snapshot), generation)
        if (active.kind === 'create') {
          const editor = getEditor()
          editor?.insertMarkdown(drawingBlockMarkdown(previewPath))
          editor?.focus()
        } else {
          const previous = active.previewSource
          applyMarkdown((markdown) => markdown.split(previous).join(previewPath))
        }
      })().catch((cause: unknown) => {
        startOperation('Saving drawing').fail(errorMessage(cause))
      })
    },
    [request, generation, getEditor, applyMarkdown],
  )

  return useMemo(
    () => ({ request, openNewDrawing, claimImageClick, saveSceneDraft, exitDrawing }),
    [request, openNewDrawing, claimImageClick, saveSceneDraft, exitDrawing],
  )
}
