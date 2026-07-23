import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface CloseRequestedEventForTest {
  preventDefault: () => void
}

type CloseRequestedHandler = (event: CloseRequestedEventForTest) => Promise<void>

const windowMock = vi.hoisted(() => ({
  closeRequested: null as CloseRequestedHandler | null,
  hide: vi.fn(async () => {}),
  fullscreen: false,
  isFullscreen: vi.fn(async () => windowMock.fullscreen),
  setFullscreen: vi.fn(async (next: boolean) => {
    windowMock.fullscreen = next
  }),
  unlisten: vi.fn(),
}))
const platform = vi.hoisted(() => ({ isMacosDesktop: true }))
const windowRole = vi.hoisted(() => ({ isMainWindow: true }))
const core = vi.hoisted(() => ({
  confirmQuit: vi.fn(async () => {}),
  quitRequested: null as (() => void) | null,
  unlisten: vi.fn(),
}))
const flushOpenDocuments = vi.hoisted(() => vi.fn(async () => {}))
const flushSettings = vi.hoisted(() => vi.fn(async () => {}))
const flushBackup = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: windowMock.hide,
    isFullscreen: windowMock.isFullscreen,
    setFullscreen: windowMock.setFullscreen,
    onCloseRequested: async (handler: CloseRequestedHandler) => {
      windowMock.closeRequested = handler
      return windowMock.unlisten
    },
  }),
}))

vi.mock('@dayjot/core', () => ({
  confirmQuit: core.confirmQuit,
  hasBridge: () => true,
  subscribeQuitRequested: async (handler: () => void) => {
    core.quitRequested = handler
    return core.unlisten
  },
}))

vi.mock('@/editor/open-documents', () => ({ flushOpenDocuments }))
vi.mock('@/lib/backup-flush', () => ({ flushBackup }))
vi.mock('@/lib/settings-flush', () => ({ flushSettings }))
vi.mock('@/lib/platform', () => ({
  get isMacosDesktop() {
    return platform.isMacosDesktop
  },
}))
vi.mock('@/lib/windows/window-role', () => ({
  isMainWindow: () => windowRole.isMainWindow,
}))

const { installQuitFlush } = await import('./quit-flush')

beforeEach(() => {
  platform.isMacosDesktop = true
  windowRole.isMainWindow = true
  windowMock.closeRequested = null
  windowMock.fullscreen = false
  core.quitRequested = null
})

afterEach(() => {
  vi.clearAllMocks()
})

interface CloseRequestForTest {
  completed: Promise<void>
  preventDefault: ReturnType<typeof vi.fn>
}

function closeCurrentWindow(): CloseRequestForTest {
  const preventDefault = vi.fn()
  const closeRequested = windowMock.closeRequested
  expect(closeRequested).not.toBeNull()
  const completed = closeRequested?.({ preventDefault }) ?? Promise.resolve()
  return { completed, preventDefault }
}

describe('installQuitFlush', () => {
  it('flushes and hides the macOS main window even when one flush rejects', async () => {
    flushSettings.mockRejectedValueOnce(new Error('settings flush failed'))
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    expect(closeRequest.preventDefault).toHaveBeenCalledOnce()
    await closeRequest.completed
    expect(flushOpenDocuments).toHaveBeenCalledOnce()
    expect(flushSettings).toHaveBeenCalledOnce()
    expect(flushBackup).toHaveBeenCalledOnce()
    expect(windowMock.hide).toHaveBeenCalledOnce()

    dispose()
  })

  it('leaves the fullscreen Space before hiding, so the screen never goes black', async () => {
    windowMock.fullscreen = true
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    await closeRequest.completed
    expect(windowMock.setFullscreen).toHaveBeenCalledWith(false)
    expect(windowMock.hide).toHaveBeenCalledOnce()
    const exitOrder = windowMock.setFullscreen.mock.invocationCallOrder[0]
    const hideOrder = windowMock.hide.mock.invocationCallOrder[0]
    expect(exitOrder).toBeLessThan(hideOrder ?? 0)

    dispose()
  })

  it('does not touch fullscreen state on a windowed close', async () => {
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    await closeRequest.completed
    expect(windowMock.setFullscreen).not.toHaveBeenCalled()
    expect(windowMock.hide).toHaveBeenCalledOnce()

    dispose()
  })

  it('still hides when the fullscreen probe fails', async () => {
    windowMock.isFullscreen.mockRejectedValueOnce(new Error('window gone'))
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    await closeRequest.completed
    expect(windowMock.hide).toHaveBeenCalledOnce()

    dispose()
  })

  it('allows secondary windows to close normally', async () => {
    windowRole.isMainWindow = false
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    expect(closeRequest.preventDefault).not.toHaveBeenCalled()
    await closeRequest.completed
    expect(flushOpenDocuments).toHaveBeenCalledOnce()
    expect(flushBackup).toHaveBeenCalledOnce()
    expect(windowMock.hide).not.toHaveBeenCalled()

    dispose()
  })

  it('allows the main window to close normally outside macOS', async () => {
    platform.isMacosDesktop = false
    const dispose = installQuitFlush()
    const closeRequest = closeCurrentWindow()

    expect(closeRequest.preventDefault).not.toHaveBeenCalled()
    await closeRequest.completed
    expect(windowMock.hide).not.toHaveBeenCalled()

    dispose()
  })
})
