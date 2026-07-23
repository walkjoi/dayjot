/**
 * The URL prefix the app serves Excalidraw's lazy-loaded assets (fonts)
 * under. Without a reachable local asset path, Excalidraw falls back to a
 * CDN (esm.sh) for fonts, which DayJot's no-external-services principle
 * forbids. Shared by the Vite plugin that bundles the font files
 * (`excalidraw-fonts-plugin.ts`) and the runtime that points Excalidraw at
 * them before its module loads (`drawing-mode-dialog.tsx`).
 */
export const EXCALIDRAW_ASSET_URL_PATH = '/excalidraw/'

declare global {
  interface Window {
    /** Read by @excalidraw/excalidraw when lazy-loading fonts. */
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}
