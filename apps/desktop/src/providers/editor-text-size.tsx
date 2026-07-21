import { useEffect, type ReactElement } from 'react'
import { useSettings } from '@/providers/settings-provider'

/**
 * Applies the editor reading size to the document root.
 *
 * Writes the `editorTextSize` setting (CSS pixels) into the
 * `--editor-font-size` variable on `<html>`, which the editor body and the
 * note-subject sizing in `styles/index.css` read. This is a side-effect-only
 * component (it renders nothing): like the theme's `.dark` toggle, the
 * preference lives in the settings document, so a choice made anywhere
 * persists across launches and applies to every editor surface (desktop and
 * mobile) at once.
 */
export function EditorTextSizeEffect(): ReactElement | null {
  const { settings } = useSettings()
  const textSize = settings.editorTextSize

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${textSize}px`)
  }, [textSize])

  return null
}
