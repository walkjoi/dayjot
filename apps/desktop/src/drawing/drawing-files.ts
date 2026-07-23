import { ulid } from 'ulidx'
import { z } from 'zod'
import { base64ToBytes, bytesToBase64, readAsset, writeAsset } from '@dayjot/core'

/**
 * On-disk layout for drawings (Plan: whiteboard blocks). A drawing is two
 * sibling files under the graph's assets:
 *
 * - `assets/drawings/<id>.excalidraw` — the scene, canonical Excalidraw JSON
 *   (the source of truth, re-openable by any Excalidraw).
 * - `assets/drawings/<id>-<rev>.png` — the rendered preview a note embeds as
 *   an ordinary `![…](…)` image.
 *
 * The preview is *revisioned*, never overwritten: the note editor is
 * uncontrolled and image nodes re-render only when the document changes, so
 * each edit session that changes the scene writes a fresh preview file and
 * swaps the note's image source. Old previews stay behind on purpose — a
 * plain ⌘Z in the note restores the previous reference, and its file must
 * still exist for the block to render.
 */
export const DRAWINGS_DIR = 'assets/drawings'

/** The alt text marking a drawing's preview image in note markdown. */
export const DRAWING_ALT_TEXT = 'Drawing'

/** ULID (lowercased) — the drawing id used in both file names. */
const DRAWING_ID_PATTERN = '[0-9a-hjkmnp-tv-z]{26}'

const previewSourcePattern = new RegExp(
  `^${DRAWINGS_DIR}/(${DRAWING_ID_PATTERN})-[0-9a-z]+\\.png$`,
)

/** Mint the identity for a new drawing. */
export function newDrawingId(): string {
  return ulid().toLowerCase()
}

/** Graph-relative path of a drawing's scene file. */
export function sceneAssetPath(drawingId: string): string {
  return `${DRAWINGS_DIR}/${drawingId}.excalidraw`
}

/** A fresh preview revision stamp (compact, filename-safe, sortable enough). */
export function newPreviewRevision(): string {
  return Date.now().toString(36)
}

/** Graph-relative path of a drawing's preview image at one revision. */
export function previewAssetPath(drawingId: string, revision: string): string {
  return `${DRAWINGS_DIR}/${drawingId}-${revision}.png`
}

/** The markdown block a note embeds a drawing through. */
export function drawingBlockMarkdown(previewPath: string): string {
  return `![${DRAWING_ALT_TEXT}](${previewPath})`
}

/**
 * Recognize an image source as a drawing preview and recover the drawing's
 * identity. Returns null for every non-drawing image, which routes the click
 * to the ordinary lightbox.
 */
export function parseDrawingPreviewSource(
  src: string,
): { drawingId: string; scenePath: string } | null {
  const match = previewSourcePattern.exec(src)
  if (match === null) {
    return null
  }
  const drawingId = match[1]
  if (drawingId === undefined) {
    return null
  }
  return { drawingId, scenePath: sceneAssetPath(drawingId) }
}

/**
 * The stored scene as this module vouches for it: JSON with the right broad
 * shape. Element/appState internals stay unknown — Excalidraw's `restore()`
 * is the domain sanitizer and runs on every load.
 */
export interface StoredDrawingScene {
  readonly elements: readonly unknown[]
  readonly appState: Readonly<Record<string, unknown>>
  readonly files: Readonly<Record<string, unknown>>
}

const storedSceneSchema = z.looseObject({
  elements: z.array(z.unknown()).default([]),
  appState: z.record(z.string(), z.unknown()).default({}),
  files: z.record(z.string(), z.unknown()).default({}),
})

/** Read and shape-validate a drawing's scene file. Throws on IO/parse errors. */
export async function readDrawingScene(
  scenePath: string,
  generation: number,
): Promise<StoredDrawingScene> {
  const bytes = base64ToBytes(await readAsset(scenePath, generation))
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
  return storedSceneSchema.parse(parsed)
}

/** Atomically write a drawing's scene file (canonical Excalidraw JSON). */
export async function writeDrawingScene(
  scenePath: string,
  sceneJson: string,
  generation: number,
): Promise<void> {
  await writeAsset(scenePath, bytesToBase64(new TextEncoder().encode(sceneJson)), generation)
}

/** Atomically write one revision of a drawing's preview image. */
export async function writeDrawingPreview(
  previewPath: string,
  preview: Blob,
  generation: number,
): Promise<void> {
  const bytes = new Uint8Array(await preview.arrayBuffer())
  await writeAsset(previewPath, bytesToBase64(bytes), generation)
}
