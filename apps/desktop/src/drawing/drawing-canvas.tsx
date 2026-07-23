import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import {
  Excalidraw,
  exportToBlob,
  getSceneVersion,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import './drawing-canvas.css'
import type { DrawingSnapshot } from './drawing-session'
import type { StoredDrawingScene } from './drawing-files'

/**
 * The live Excalidraw surface of drawing mode. This module is the app's only
 * runtime dependency on `@excalidraw/excalidraw` and is loaded lazily
 * (`drawing-mode-dialog.tsx`), so the ~1 MB editor costs nothing until the
 * first drawing opens.
 */

/** Scene edits settle for this long before a draft write goes out. */
const AUTOSAVE_DELAY_MS = 1000

const PREVIEW_PADDING = 16
/** Preview PNGs render at 2× so they stay crisp on retina note surfaces. */
const PREVIEW_SCALE = 2

/**
 * Previews are always exported light-on-white, whatever the app theme: the
 * PNG is a document artifact that must read the same across theme switches
 * and on every device the graph syncs to.
 */
const PREVIEW_BACKGROUND = '#ffffff'

/**
 * DayJot owns persistence, theme, and export — Excalidraw's own affordances
 * for those would write files behind the app's back or fork the theme.
 */
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
} as const

type RestoreInput = Parameters<typeof restore>[0]

export interface DrawingCanvasProps {
  /** The stored scene to open, or null for a brand-new drawing. */
  initialScene: StoredDrawingScene | null
  theme: 'light' | 'dark'
  /** Start with the pen active (the create flow's "draw immediately"). */
  startWithPen: boolean
  /** Draft persistence, called with canonical scene JSON after edits settle. */
  onAutosave: (sceneJson: string) => void
  /**
   * Hands the host a snapshot taker once the canvas is live. Called exactly
   * once per mount; the host uses it at exit time, after which the canvas
   * may unmount (the snapshot is plain data).
   */
  onReady: (takeSnapshot: () => DrawingSnapshot) => void
}

function serializeScene(api: ExcalidrawImperativeAPI): string {
  // Including deleted elements matches what the Excalidraw app itself feeds
  // its file writer; serializeAsJSON drops the tombstones for storage.
  return serializeAsJSON(
    api.getSceneElementsIncludingDeleted(),
    api.getAppState(),
    api.getFiles(),
    'local',
  )
}

/** Render a snapshot's scene as the preview PNG a note block embeds. */
export async function exportPreviewBlob(snapshot: DrawingSnapshot): Promise<Blob> {
  return exportToBlob({
    elements: snapshot.elements,
    appState: {
      ...snapshot.appState,
      exportBackground: true,
      viewBackgroundColor: PREVIEW_BACKGROUND,
      exportWithDarkMode: false,
    },
    files: snapshot.files,
    mimeType: 'image/png',
    exportPadding: PREVIEW_PADDING,
    getDimensions: (width: number, height: number) => ({
      width: width * PREVIEW_SCALE,
      height: height * PREVIEW_SCALE,
      scale: PREVIEW_SCALE,
    }),
  })
}

export function DrawingCanvas({
  initialScene,
  theme,
  startWithPen,
  onAutosave,
  onReady,
}: DrawingCanvasProps): ReactElement {
  // restore() is Excalidraw's own sanitizer for untrusted scene data and
  // runs on every load; the zod pass in drawing-files.ts vouched for the
  // broad JSON shape, so this is the one sanctioned boundary assertion.
  const restored = useMemo(
    () => restore(initialScene as RestoreInput, null, null),
    [initialScene],
  )

  const autosaveTimer = useRef<number | null>(null)
  // Content-version bookkeeping: getSceneVersion sums element versions, so
  // selection/pointer churn (which also fires onChange) never queues a save.
  const initialVersion = useMemo(() => getSceneVersion(restored.elements), [restored])
  const lastSeenVersion = useRef(initialVersion)
  const everChanged = useRef(false)

  // Latest callbacks behind refs, so the uncontrolled Excalidraw tree never
  // remounts over a changing prop identity (same contract as note-editor).
  const onAutosaveRef = useRef(onAutosave)
  const onReadyRef = useRef(onReady)
  useLayoutEffect(() => {
    onAutosaveRef.current = onAutosave
    onReadyRef.current = onReady
  })

  useLayoutEffect(() => {
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current)
      }
    }
  }, [])

  const handleApi = (api: ExcalidrawImperativeAPI): void => {
    if (startWithPen) {
      api.setActiveTool({ type: 'freedraw' })
    }
    onReadyRef.current(
      (): DrawingSnapshot => ({
        changedSinceOpen: everChanged.current,
        empty: api.getSceneElements().length === 0,
        sceneJson: serializeScene(api),
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      }),
    )

    const scheduleAutosave = (): void => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current)
      }
      autosaveTimer.current = window.setTimeout(() => {
        autosaveTimer.current = null
        onAutosaveRef.current(serializeScene(api))
      }, AUTOSAVE_DELAY_MS)
    }

    api.onChange((elements) => {
      const version = getSceneVersion(elements)
      if (version === lastSeenVersion.current) {
        return
      }
      lastSeenVersion.current = version
      everChanged.current = true
      scheduleAutosave()
    })
  }

  return (
    <div className="dayjot-drawing-canvas h-full w-full">
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={{
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
          scrollToContent: true,
        }}
        theme={theme}
        UIOptions={UI_OPTIONS}
        // Embeddable elements (YouTube/Vimeo iframes) load external content;
        // rejecting them keeps drawings fully offline.
        validateEmbeddable={false}
      />
    </div>
  )
}
