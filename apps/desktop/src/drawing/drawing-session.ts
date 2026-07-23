import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types'

/**
 * Shared shapes for one drawing-mode session. Type-only Excalidraw imports:
 * this module (and everything outside the lazy canvas chunk) must not pull
 * the Excalidraw runtime into the main bundle.
 */

/** What drawing mode was opened for. */
export type DrawingModeRequest =
  | {
      /** A fresh drawing from `/draw` — embedded into the note on exit. */
      readonly kind: 'create'
      readonly drawingId: string
      readonly scenePath: string
    }
  | {
      /** An existing block being re-entered. */
      readonly kind: 'edit'
      readonly drawingId: string
      readonly scenePath: string
      /** The exact image source in the note markdown (the swap target). */
      readonly previewSource: string
    }

/**
 * The scene captured synchronously as drawing mode closes, so persistence
 * and preview export can run after the canvas unmounts.
 */
export interface DrawingSnapshot {
  /** Did the scene's content ever change during the session? */
  readonly changedSinceOpen: boolean
  /** True when no visible (non-deleted) elements remain. */
  readonly empty: boolean
  /** Canonical `.excalidraw` JSON of the final scene. */
  readonly sceneJson: string
  readonly elements: readonly NonDeleted<ExcalidrawElement>[]
  readonly appState: AppState
  readonly files: BinaryFiles
}
