import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { registerAppCommands } from '@/lib/commands/app-commands'
import { installNativeMenu } from '@/lib/native-menu/menu'
import { installTauriBridge } from '@/lib/tauri-bridge'
import { DesktopRoot } from '@/desktop-root'
import { EditorFontEffect } from '@/providers/editor-font'
import { EditorFullWidthEffect } from '@/providers/editor-full-width'
import { EditorTextSizeEffect } from '@/providers/editor-text-size'
import { SettingsProvider } from '@/providers/settings-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import '@/styles/index.css'

installTauriBridge()
registerAppCommands()
installNativeMenu().catch((cause: unknown) => {
  console.error('failed to install the native menu', cause)
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <EditorFullWidthEffect />
        <EditorTextSizeEffect />
        <EditorFontEffect />
        <ThemeProvider>
          <DesktopRoot />
        </ThemeProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
