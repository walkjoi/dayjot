import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { ArrowLeft } from 'lucide-react'
import { errorMessage } from '@dayjot/core'
import { Button } from '@/components/ui/button'
import { LightboxDialog } from '@/editor/lightbox-dialog'
import { hasMacosTitleBarOverlay } from '@/lib/window-chrome'
import { useTheme } from '@/providers/theme-provider'
import { EXCALIDRAW_ASSET_URL_PATH } from './excalidraw-asset-path'
import { readDrawingScene, type StoredDrawingScene } from './drawing-files'
import type { DrawingModeRequest, DrawingSnapshot } from './drawing-session'

/**
 * Drawing mode: the full-window surface a drawing block opens into. Only the
 * drawing is shown — a slim header (back + Done) over an Excalidraw canvas
 * that owns every key and gesture, so there is no focus contention with the
 * note editor underneath. Exit paths (esc, ⌘↩, Done, back) all converge on
 * one close that hands the host a final scene snapshot; drafts were
 * autosaved continuously, so closing is never a "save changes?" decision.
 */

const DrawingCanvas = lazy(async () => {
  // Excalidraw resolves lazy assets (fonts) against this global, falling
  // back to a CDN when unset — point it at the bundled copies before the
  // module evaluates.
  window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_URL_PATH
  const module = await import('./drawing-canvas')
  return { default: module.DrawingCanvas }
})

interface DrawingModeDialogProps {
  /** The drawing to show; null keeps the dialog closed. */
  request: DrawingModeRequest | null
  /** Graph session the drawing's files are pinned to. */
  generation: number | null
  /** Draft persistence for canvas edits (debounced upstream of this call). */
  onAutosave: (sceneJson: string) => void
  /**
   * Drawing mode closed. The snapshot is the final scene, or null when the
   * canvas never became ready (load error, instant close).
   */
  onExit: (snapshot: DrawingSnapshot | null) => void
}

/**
 * Hook-free shell: panes mount this permanently, and everything stateful
 * (theme, scene load) lives in {@link OpenDrawingMode}, which exists only
 * while a drawing is open — so a fresh session can never inherit the
 * previous one's state, and closed panes pay no hook cost.
 */
export function DrawingModeDialog({
  request,
  generation,
  onAutosave,
  onExit,
}: DrawingModeDialogProps): ReactElement | null {
  if (request === null) {
    return null
  }
  return (
    <OpenDrawingMode
      request={request}
      generation={generation}
      onAutosave={onAutosave}
      onExit={onExit}
    />
  )
}

type SceneLoad =
  | { status: 'loading' }
  | { status: 'ready'; initialScene: StoredDrawingScene | null }
  | { status: 'error'; message: string }

function initialLoad(request: DrawingModeRequest, generation: number | null): SceneLoad {
  if (request.kind === 'create') {
    return { status: 'ready', initialScene: null }
  }
  if (generation === null) {
    return { status: 'error', message: 'No graph is open.' }
  }
  return { status: 'loading' }
}

function CanvasStatus({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-text-secondary">
      {children}
    </div>
  )
}

interface OpenDrawingModeProps extends DrawingModeDialogProps {
  request: DrawingModeRequest
}

function OpenDrawingMode({
  request,
  generation,
  onAutosave,
  onExit,
}: OpenDrawingModeProps): ReactElement {
  const { resolvedTheme } = useTheme()
  const [load, setLoad] = useState<SceneLoad>(() => initialLoad(request, generation))
  const takeSnapshot = useRef<(() => DrawingSnapshot) | null>(null)

  useEffect(() => {
    if (request.kind !== 'edit' || generation === null) {
      return
    }
    let cancelled = false
    readDrawingScene(request.scenePath, generation).then(
      (scene) => {
        if (!cancelled) {
          setLoad({ status: 'ready', initialScene: scene })
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setLoad({ status: 'error', message: errorMessage(cause) })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [request, generation])

  const exit = (): void => {
    const snapshot = takeSnapshot.current
    takeSnapshot.current = null
    onExit(snapshot?.() ?? null)
  }

  return (
    <LightboxDialog open title="Drawing" onClose={exit} immersive>
      <div
        className="flex h-full w-full flex-col bg-background"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            exit()
          }
        }}
      >
        {/* Drawing mode covers the app's WindowDragRegion, so it carries its
            own stand-in for the overlaid macOS title bar: the strip keeps the
            header clear of the traffic lights and keeps the window draggable. */}
        {hasMacosTitleBarOverlay ? (
          <div aria-hidden data-tauri-drag-region className="h-7 flex-none" />
        ) : null}
        <header className="flex h-11 flex-none items-center justify-between border-b px-2">
          <Button variant="ghost" size="sm" onClick={exit}>
            <ArrowLeft aria-hidden />
            Back to note
          </Button>
          <Button size="sm" onClick={exit}>
            Done
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {load.status === 'loading' ? (
            <CanvasStatus>Opening drawing…</CanvasStatus>
          ) : load.status === 'error' ? (
            <CanvasStatus>
              <span role="alert">Couldn’t open the drawing: {load.message}</span>
              <Button variant="outline" size="sm" onClick={exit}>
                Back to note
              </Button>
            </CanvasStatus>
          ) : (
            <Suspense fallback={<CanvasStatus>Opening drawing…</CanvasStatus>}>
              <DrawingCanvas
                initialScene={load.initialScene}
                theme={resolvedTheme}
                startWithPen={request.kind === 'create'}
                onAutosave={onAutosave}
                onReady={(snapshot) => {
                  takeSnapshot.current = snapshot
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </LightboxDialog>
  )
}
