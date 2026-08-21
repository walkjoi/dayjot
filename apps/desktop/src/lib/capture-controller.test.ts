import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DrainCaptureInboxInput,
  DrainCaptureInboxOutcome,
  FileChange,
  ReconcileCaptureEnrichmentInput,
  ReconcileCaptureEnrichmentOutcome,
} from '@dayjot/core'
import { createCaptureController, type CaptureController } from './capture-controller'

const drainCaptureInbox = vi.hoisted(() =>
  vi.fn<(input: DrainCaptureInboxInput) => Promise<DrainCaptureInboxOutcome>>(),
)
const reconcileCaptureEnrichment = vi.hoisted(() =>
  vi.fn<(input: ReconcileCaptureEnrichmentInput) => Promise<ReconcileCaptureEnrichmentOutcome>>(),
)
const subscribeFileChanges = vi.hoisted(() =>
  vi.fn<(handler: (changes: readonly FileChange[]) => void) => Promise<() => void>>(),
)
const failOperation = vi.hoisted(() => vi.fn<(message: string) => void>())

vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  drainCaptureInbox,
  reconcileCaptureEnrichment,
  subscribeFileChanges,
  hasBridge: () => true,
}))
vi.mock('@/lib/provider-fetch', () => ({
  providerFetch: vi.fn(),
}))
vi.mock('@/lib/operations', () => ({
  startOperation: () => ({ progress: vi.fn(), done: vi.fn(), fail: failOperation }),
}))

function drained(overrides: Partial<DrainCaptureInboxOutcome> = {}): DrainCaptureInboxOutcome {
  return { pending: 0, drained: 0, deduped: 0, invalid: 0, stopped: null, ...overrides }
}

function enriched(
  overrides: Partial<ReconcileCaptureEnrichmentOutcome> = {},
): ReconcileCaptureEnrichmentOutcome {
  return { pending: 0, enriched: 0, skipped: 0, stopped: null, ...overrides }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

let controller: CaptureController | null = null

function create(): CaptureController {
  controller = createCaptureController({ generation: 3 })
  return controller
}

beforeEach(() => {
  vi.clearAllMocks()
  drainCaptureInbox.mockResolvedValue(drained())
  reconcileCaptureEnrichment.mockResolvedValue(enriched())
  subscribeFileChanges.mockResolvedValue(vi.fn())
})

afterEach(() => {
  controller?.dispose()
  controller = null
})

describe('createCaptureController', () => {
  it('passes run drain-then-enrich', async () => {
    create().start()
    await flush()

    expect(drainCaptureInbox).toHaveBeenCalledTimes(1)
    expect(reconcileCaptureEnrichment).toHaveBeenCalledTimes(1)
    expect(failOperation).not.toHaveBeenCalled()
  })

  it('does not listen for visibility changes', async () => {
    create().start()
    await flush()
    expect(drainCaptureInbox).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(drainCaptureInbox).toHaveBeenCalledTimes(1)
  })
})
