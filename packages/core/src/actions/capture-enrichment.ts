import { errorMessage, isAppError, toAppError } from '../errors'
import { listFiles, readNote, writeNote } from '../graph/commands'
import { dailyPath } from '../graph/paths'
import { hashContent } from '../indexing/hash'
import { parseFrontmatter, splitFrontmatter, upsertFrontmatter } from '../markdown/frontmatter'
import type { ReconcileStop } from './reconcile'
import {
  finishCaptureWrite,
  hasCaptureWriteTransaction,
  persistCaptureEnrichment,
  readPendingCaptureSnapshot,
  type PendingCaptureSnapshot,
} from './capture-enrichment-write'
import { captureFromPath, type CaptureIdentity } from './capture-identity'
import {
  captureNoteMeta,
  displayTitle,
  hasDescription,
  notePrivate,
  noteSource,
  withDescription,
  withTitle,
} from './capture-note'
import { scrapePageMeta, type PageMeta } from './meta-scrape'

/**
 * Capture notes still awaiting enrichment, oldest first: well-formed capture
 * notes whose frontmatter says `captureStatus: pending`.
 */
export async function listPendingCaptures(generation: number): Promise<CaptureIdentity[]> {
  const files = await listFiles(generation)
  const candidates = files
    .map((file) => captureFromPath(file.path))
    .filter((identity): identity is CaptureIdentity => identity !== null)
    .sort((first, second) => first.base.localeCompare(second.base))
  const pending: CaptureIdentity[] = []
  for (const identity of candidates) {
    let source: string
    try {
      source = await readNote(identity.notePath, generation)
    } catch (cause) {
      if (isAppError(cause) && cause.kind === 'notFound') {
        continue
      }
      throw cause
    }
    const meta = captureNoteMeta(parseFrontmatter(splitFrontmatter(source).raw).data)
    if (meta?.captureStatus === 'pending') {
      pending.push(identity)
    }
  }
  return pending
}

export interface ReconcileCaptureEnrichmentInput {
  /** `GraphInfo.generation` — pins every read and write to the issuing graph. */
  generation: number
  /** Abort gate, checked between notes and after every slow await. */
  isStale?: () => boolean
  /** Observes how many captures need enrichment, before work starts. */
  onPending?: (count: number) => void
}

export interface ReconcileCaptureEnrichmentOutcome {
  /** Captures that were pending when the pass started. */
  pending: number
  /** Captures this pass enriched with scraped page metadata. */
  enriched: number
  /** Captures marked skipped (made private, or edited since the raw save). */
  skipped: number
  /** Why captures remain pending, or `null` when the pass drained. */
  stopped: ReconcileStop | null
}

/**
 * Enrich every pending capture with the page's scraped metadata: the meta
 * description and a display title when the raw save only had the URL. A
 * completed pass stamps `captureStatus: done`; a transient failure (network)
 * leaves the capture pending for retry. Never throws.
 */
export async function reconcileCaptureEnrichment(
  input: ReconcileCaptureEnrichmentInput,
): Promise<ReconcileCaptureEnrichmentOutcome> {
  let pending: CaptureIdentity[]
  try {
    pending = await listPendingCaptures(input.generation)
  } catch (cause) {
    return {
      pending: 0,
      enriched: 0,
      skipped: 0,
      stopped: { reason: toAppError(cause).kind, message: errorMessage(cause) },
    }
  }
  input.onPending?.(pending.length)
  if (pending.length === 0) {
    return { pending: 0, enriched: 0, skipped: 0, stopped: null }
  }

  let enriched = 0
  let skipped = 0
  const stale = (): boolean => input.isStale?.() === true
  const outcome = (stopped: ReconcileStop | null): ReconcileCaptureEnrichmentOutcome => ({
    pending: pending.length,
    enriched,
    skipped,
    stopped,
  })
  const markSkipped = async (source: string, identity: CaptureIdentity): Promise<void> => {
    await writeNote(
      identity.notePath,
      upsertFrontmatter(source, {
        captureStatus: 'skipped',
        captureDailyFromTitle: undefined,
        captureFinalizeStatus: undefined,
      }),
      input.generation,
    )
    skipped += 1
  }
  const skipPending = async (identity: CaptureIdentity): Promise<void> => {
    const snapshot = await readPendingCaptureSnapshot(identity, input.generation)
    if (snapshot !== null) {
      await markSkipped(snapshot.source, identity)
    }
  }
  const currentCapture = async (
    identity: CaptureIdentity,
    expectedHash?: string,
  ): Promise<PendingCaptureSnapshot | null> => {
    const snapshot = await readPendingCaptureSnapshot(identity, input.generation)
    if (snapshot === null) {
      return null
    }
    const dailySource = await noteSource(dailyPath(identity.date), input.generation)
    const bodyHash = await hashContent(snapshot.body)
    if (
      snapshot.isPrivate ||
      notePrivate(dailySource) ||
      bodyHash !== (expectedHash ?? snapshot.meta.captureHash)
    ) {
      await markSkipped(snapshot.source, identity)
      return null
    }
    return snapshot
  }

  for (const identity of pending) {
    if (stale()) {
      return outcome({ reason: 'stale', message: 'the graph session ended mid-pass' })
    }
    try {
      let snapshot = await currentCapture(identity)
      if (snapshot === null) {
        continue
      }
      if (hasCaptureWriteTransaction(snapshot.meta)) {
        const finalized = await finishCaptureWrite(identity, input.generation)
        if (finalized === null) {
          await skipPending(identity)
          continue
        }
        if (finalized === 'done') {
          enriched += 1
          continue
        }
        snapshot = await currentCapture(identity)
        if (snapshot === null) {
          continue
        }
      }
      if (snapshot.meta.captureMetadataStatus === 'done') {
        // Metadata already landed on an earlier pass — just stamp done.
        const captureHash = await persistCaptureEnrichment({
          identity,
          expectedHash: snapshot.meta.captureHash,
          body: snapshot.body,
          fromTitle: snapshot.title,
          toTitle: snapshot.title,
          status: 'done',
          generation: input.generation,
        })
        if (captureHash === null) {
          await skipPending(identity)
          continue
        }
        enriched += 1
        continue
      }

      let pageMeta: PageMeta | null = null
      try {
        pageMeta = await scrapePageMeta(snapshot.meta.captureUrl)
      } catch (cause) {
        const kind = toAppError(cause).kind
        if (kind === 'network' || kind === 'auth') {
          throw cause
        }
        // Invalid URLs, non-HTML responses, and non-success statuses are
        // permanent for this capture; persist the no-metadata result.
        pageMeta = null
      }
      if (stale()) {
        return outcome({ reason: 'stale', message: 'the graph session ended mid-pass' })
      }

      snapshot = await currentCapture(identity)
      if (snapshot === null) {
        continue
      }
      const placeholderTitle = displayTitle({ title: '', url: snapshot.meta.captureUrl })
      const metadataTitle =
        snapshot.title === placeholderTitle && pageMeta?.title
          ? displayTitle({ title: pageMeta.title, url: snapshot.meta.captureUrl })
          : null
      const metadataDisplayTitle = metadataTitle ?? snapshot.title
      const metadataDescription = hasDescription(snapshot.body)
        ? null
        : pageMeta?.description ?? null
      let metadataBody =
        metadataDescription !== null
          ? withDescription(snapshot.body, metadataDescription)
          : snapshot.body
      if (metadataTitle !== null) {
        metadataBody = withTitle(metadataBody, metadataTitle)
      }

      const titleChanged = metadataDisplayTitle !== snapshot.title
      // Two persists on purpose: the retitle commits as `pending` first so an
      // interrupted Daily write resumes as `pending`. Only after the retitle
      // fully lands does the second persist stamp `done`.
      const captureHash = await persistCaptureEnrichment({
        identity,
        expectedHash: snapshot.meta.captureHash,
        body: metadataBody,
        fromTitle: snapshot.title,
        toTitle: metadataDisplayTitle,
        status: titleChanged ? 'pending' : 'done',
        generation: input.generation,
      })
      if (captureHash === null) {
        await skipPending(identity)
        continue
      }
      if (titleChanged) {
        const finalizedHash = await persistCaptureEnrichment({
          identity,
          expectedHash: captureHash,
          body: metadataBody,
          fromTitle: metadataDisplayTitle,
          toTitle: metadataDisplayTitle,
          status: 'done',
          generation: input.generation,
        })
        if (finalizedHash === null) {
          await skipPending(identity)
          continue
        }
      }
      enriched += 1
    } catch (cause) {
      return outcome({ reason: toAppError(cause).kind, message: errorMessage(cause) })
    }
  }
  return outcome(null)
}
