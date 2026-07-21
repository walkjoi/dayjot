import { useEffect, type ReactElement } from 'react'
import { useSettings } from '@/providers/settings-provider'

/**
 * Applies the note canvas's reading typeface to the document root.
 *
 * Mirrors the `editorFont` setting onto `[data-editor-font]` on `<html>`,
 * which `styles/index.css` maps to the `--font-reading` variable the editor
 * (and the daily-note date heading) reads. This is a side-effect-only
 * component (it renders nothing): like `EditorTextSizeEffect`, the preference
 * lives in the settings document, so a choice made anywhere persists across
 * launches and applies to every editor surface (desktop and mobile) at once.
 */
export function EditorFontEffect(): ReactElement | null {
  const { settings } = useSettings()
  const editorFont = settings.editorFont

  useEffect(() => {
    document.documentElement.setAttribute('data-editor-font', editorFont)
  }, [editorFont])

  return null
}
