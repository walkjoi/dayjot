import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DayJotError } from '../errors'
import {
  addSpool,
  DAILY,
  drain,
  envelope,
  files,
  IDENTITY,
  reconcile,
  scrapeMock,
  wireCaptureMocks,
  writeNoteMock,
} from './capture-harness'
import type { CaptureEnvelope } from './capture-envelope'

const ensureBacklinkTargetMock = vi.hoisted(() => vi.fn())

vi.mock('../graph/commands', () => ({
  captureInboxList: vi.fn(),
  captureInboxRead: vi.fn(),
  captureInboxReject: vi.fn(),
  captureInboxRemove: vi.fn(),
  listFiles: vi.fn(),
  promoteCaptureScreenshot: vi.fn(),
  readAsset: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
}))
vi.mock('./meta-scrape', () => ({
  scrapePageMeta: vi.fn(),
}))
vi.mock('./backlink-target', () => ({
  ensureBacklinkTarget: ensureBacklinkTargetMock,
}))

beforeEach(() => {
  wireCaptureMocks()
  ensureBacklinkTargetMock.mockResolvedValue('Links')
})

describe('reconcileCaptureEnrichment', () => {
  async function drainOne(overrides: Partial<CaptureEnvelope> = {}): Promise<void> {
    addSpool(envelope(overrides))
    const outcome = await drain()
    expect(outcome.stopped).toBeNull()
    writeNoteMock.mockClear()
  }

  it('enriches with the scraped description and stamps the capture done', async () => {
    await drainOne()
    scrapeMock.mockResolvedValue({
      title: 'An article',
      description: 'A scraped description.',
      siteName: null,
    })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 1, skipped: 0, stopped: null })
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('- Description: A scraped description.')
    expect(note).toContain('captureStatus: done')
    // Enriched means no longer pending: a second pass finds nothing.
    expect((await reconcile()).pending).toBe(0)
  })

  it('keeps a drain-written in-page description (never truncates)', async () => {
    await drainOne({ source: 'ios-share', metaDescription: 'The full in-page description.' })
    scrapeMock.mockResolvedValue({
      title: 'An article',
      description: 'A shorter scraped description.',
      siteName: null,
    })

    const outcome = await reconcile()

    expect(outcome.enriched).toBe(1)
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('- Description: The full in-page description.')
    expect(note).not.toContain('A shorter scraped description.')
    expect(note).toContain('captureStatus: done')
  })

  it.each([
    ['an empty title', ''],
    ['a host-equivalent title', 'example.com'],
  ])('retitles a URL-only iOS share with %s from scraped metadata', async (_label, title) => {
    addSpool(envelope({ source: 'ios-share', title }), { screenshot: false })
    expect((await drain()).stopped).toBeNull()
    writeNoteMock.mockClear()
    scrapeMock.mockResolvedValue({
      title: 'An article from its metadata',
      description: 'A scraped description.',
      siteName: 'Example',
    })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 1, skipped: 0, stopped: null })
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('# An article from its metadata')
    expect(note).toContain('- Description: A scraped description.')
    expect(note).toContain('captureStatus: done')
    const daily = files.get(DAILY) ?? ''
    expect(daily).toContain(
      '- [[capture-2026-06-11-153022-845-7c9e|An article from its metadata]]',
    )
    expect(daily).not.toContain('|example.com]]')
  })

  it('keeps a supplied capture title when scraped metadata differs', async () => {
    await drainOne({ source: 'ios-share', title: 'The title supplied by the app' })
    scrapeMock.mockResolvedValue({
      title: 'A different metadata title',
      description: 'A scraped description.',
      siteName: 'Example',
    })

    const outcome = await reconcile()

    expect(outcome.enriched).toBe(1)
    expect(files.get(IDENTITY.notePath)).toContain('# The title supplied by the app')
    expect(files.get(DAILY)).toContain('|The title supplied by the app]]')
    expect(files.get(DAILY)).not.toContain('|A different metadata title]]')
  })

  it('skips an edited capture instead of clobbering it — zero outbound', async () => {
    await drainOne()
    const source = files.get(IDENTITY.notePath) ?? ''
    files.set(IDENTITY.notePath, source.replace('# An article', '# My own notes about this'))

    const outcome = await reconcile()

    expect(outcome.skipped).toBe(1)
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('captureStatus: skipped')
    expect(note).toContain('# My own notes about this')
    expect(scrapeMock).not.toHaveBeenCalled()
  })

  it('skips when the day was marked private after the drain — zero outbound', async () => {
    await drainOne()
    files.set(DAILY, `---\nprivate: true\n---\n\n${files.get(DAILY) ?? ''}`)

    const outcome = await reconcile()

    expect(outcome.skipped).toBe(1)
    expect(files.get(IDENTITY.notePath)).toContain('captureStatus: skipped')
    expect(scrapeMock).not.toHaveBeenCalled()
  })

  it('skips when the capture note itself was marked private — zero outbound', async () => {
    await drainOne()
    const source = files.get(IDENTITY.notePath) ?? ''
    files.set(IDENTITY.notePath, source.replace('---\n', '---\nprivate: true\n'))

    const outcome = await reconcile()

    expect(outcome.skipped).toBe(1)
    expect(scrapeMock).not.toHaveBeenCalled()
  })

  it('preserves capture edits made while metadata is being fetched', async () => {
    await drainOne({ source: 'ios-share', title: '' })
    scrapeMock.mockImplementation(async () => {
      const source = files.get(IDENTITY.notePath) ?? ''
      files.set(IDENTITY.notePath, source.replace('# example.com', '# My edited title'))
      return {
        title: 'A scraped title',
        description: 'A scraped description.',
        siteName: null,
      }
    })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 0, skipped: 1, stopped: null })
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('# My edited title')
    expect(note).not.toContain('A scraped description.')
    expect(note).toContain('captureStatus: skipped')
  })

  it('skips when the day becomes private during the metadata fetch', async () => {
    await drainOne()
    scrapeMock.mockImplementation(async () => {
      files.set(DAILY, `---\nprivate: true\n---\n\n${files.get(DAILY) ?? ''}`)
      return {
        title: 'An article',
        description: 'A scraped description.',
        siteName: null,
      }
    })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 0, skipped: 1, stopped: null })
    expect(files.get(IDENTITY.notePath)).toContain('captureStatus: skipped')
  })

  it('does not resurrect a capture deleted during metadata fetch', async () => {
    await drainOne()
    scrapeMock.mockImplementation(async () => {
      files.delete(IDENTITY.notePath)
      return {
        title: 'An article',
        description: 'A scraped description.',
        siteName: null,
      }
    })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 0, skipped: 0, stopped: null })
    expect(files.has(IDENTITY.notePath)).toBe(false)
  })

  it('a transient scrape failure stops the pass; the next pass retries', async () => {
    await drainOne()
    scrapeMock.mockRejectedValueOnce(new DayJotError('network', 'offline'))

    const first = await reconcile()
    expect(first.stopped?.reason).toBe('network')
    expect(files.get(IDENTITY.notePath)).toContain('captureStatus: pending')

    const second = await reconcile()
    expect(second.enriched).toBe(1)
  })

  it('a permanent scrape failure enriches without meta tags', async () => {
    await drainOne()
    scrapeMock.mockRejectedValue(new DayJotError('parse', 'not an HTML page'))

    const outcome = await reconcile()

    expect(outcome.enriched).toBe(1)
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).not.toContain('- Description:')
    expect(note).toContain('captureStatus: done')
  })

  it('omits the description bullet when no description source exists', async () => {
    await drainOne()
    scrapeMock.mockResolvedValue({ title: 'An article', description: null, siteName: null })

    const outcome = await reconcile()

    expect(outcome.enriched).toBe(1)
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).not.toContain('- Description:')
    expect(note).toContain('captureStatus: done')
  })

  it('resumes the exact metadata checkpoint when its daily write fails', async () => {
    await drainOne({ source: 'ios-share', title: '' })
    scrapeMock.mockResolvedValue({
      title: 'A title from metadata',
      description: 'A scraped description.',
      siteName: null,
    })
    writeNoteMock
      .mockImplementationOnce(async (path, contents) => {
        files.set(path, contents)
      })
      .mockRejectedValueOnce({ kind: 'io', message: 'disk full' })

    const first = await reconcile()

    expect(first.stopped?.reason).toBe('io')
    expect(files.get(DAILY)).toContain('|example.com]]')
    expect(files.get(IDENTITY.notePath)).toContain('# A title from metadata')
    expect(files.get(IDENTITY.notePath)).toContain('captureStatus: pending')
    expect(files.get(IDENTITY.notePath)).toContain('captureDailyFromTitle: example.com')
    expect(files.get(IDENTITY.notePath)).toContain('captureFinalizeStatus: pending')

    scrapeMock.mockResolvedValue({
      title: 'A different title on retry',
      description: 'A different description on retry.',
      siteName: null,
    })

    const retry = await reconcile()

    expect(retry).toEqual({ pending: 1, enriched: 1, skipped: 0, stopped: null })
    expect(files.get(DAILY)).toContain('|A title from metadata]]')
    expect(files.get(IDENTITY.notePath)).toContain('# A title from metadata')
    expect(files.get(IDENTITY.notePath)).not.toContain('A different title on retry')
    expect(files.get(IDENTITY.notePath)).toContain('captureStatus: done')
    expect(files.get(IDENTITY.notePath)).not.toContain('captureDailyFromTitle')
    expect(files.get(IDENTITY.notePath)).not.toContain('captureFinalizeStatus')
    expect(scrapeMock).toHaveBeenCalledTimes(1)
  })

  it('preserves privacy set while a metadata retitle writes the daily backlink', async () => {
    await drainOne({ source: 'ios-share', title: '' })
    scrapeMock.mockResolvedValue({
      title: 'A title from metadata',
      description: 'A scraped description.',
      siteName: null,
    })
    writeNoteMock
      .mockImplementationOnce(async (path, contents) => {
        files.set(path, contents)
      })
      .mockImplementationOnce(async (path, contents) => {
        files.set(path, contents)
        const prepared = files.get(IDENTITY.notePath) ?? ''
        files.set(IDENTITY.notePath, prepared.replace('---\n', '---\nprivate: true\n'))
      })

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 1, enriched: 0, skipped: 1, stopped: null })
    const note = files.get(IDENTITY.notePath) ?? ''
    expect(note).toContain('private: true')
    expect(note).toContain('# A title from metadata')
    expect(note).toContain('captureStatus: skipped')
    expect(note).not.toContain('captureDailyFromTitle')
    expect(note).not.toContain('captureFinalizeStatus')
  })

  it('leaves a user-edited daily link text alone while still retitling the note', async () => {
    addSpool(envelope({ source: 'ios-share', title: '' }), { screenshot: false })
    expect((await drain()).stopped).toBeNull()
    writeNoteMock.mockClear()
    files.set(DAILY, (files.get(DAILY) ?? '').replace('|example.com]]', '|my own link text]]'))
    scrapeMock.mockResolvedValue({
      title: 'A title from metadata',
      description: null,
      siteName: null,
    })

    const outcome = await reconcile()

    expect(outcome.enriched).toBe(1)
    expect(files.get(IDENTITY.notePath)).toContain('# A title from metadata')
    expect(files.get(DAILY)).toContain('|my own link text]]')
  })

  it('never re-enriches done or skipped captures', async () => {
    await drainOne()
    await reconcile()

    const outcome = await reconcile()

    expect(outcome).toEqual({ pending: 0, enriched: 0, skipped: 0, stopped: null })
  })
})
