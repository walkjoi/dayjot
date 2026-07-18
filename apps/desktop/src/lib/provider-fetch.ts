import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { hasBridge } from '@dayjot/core'

/**
 * The transport for the app's GitHub calls (device-flow auth, repo + gist
 * APIs). Inside the Tauri shell this is the HTTP plugin's fetch — requests go
 * out from the Rust side, so webview CORS doesn't apply. The allowed hosts are
 * scoped in `src-tauri/capabilities/default.json`. In plain-browser dev there
 * is no shell, so this falls back to the global fetch.
 */
export function providerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return hasBridge() ? tauriFetch(input, init) : fetch(input, init)
}
