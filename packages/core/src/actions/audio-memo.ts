import { errorMessage, isAppError, toAppError, type AppError } from '../errors'
import { listDir, listFiles, readNote, writeAsset, writeNote } from '../graph/commands'
import { bytesToBase64 } from '../graph/base64'
import { AUDIO_MEMOS_DIR, audioMemoPath, dailyPath, notePath } from '../graph/paths'
import { appendUnderBacklinkedHeading, wikiLinkSafe } from '../markdown/edit'
import { ensureBacklinkTarget } from './backlink-target'

/**
 * Capture actions for audio memos (the first of the `actions/` capture
 * family — Plan 11's link capture sits alongside). The pipeline is raw-first,
 * like the capture-inbox spool: the recording itself is the durable artifact,
 * and filing it into the note graph is async work that can fail and retry
 * freely.
 *
 * 1. **Capture** ({@link captureAudioMemo}): the recording is written to
 *    `audio-memos/audio-memo-<date>-<time>.<ext>` — local, instant, no
 *    network. The sync engine commits it like any other change.
 * 2. **Reconcile** ({@link reconcileAudioMemos}): a memo's note is a note with
 *    the **same basename** (`notes/<base>.md`). Any memo without one resolves
 *    or creates the `Audio memos` category note, gets a memo note holding a
 *    link to the recording, and is backlinked from its day's daily note —
 *    memo note first, because it carries the result: a failure between the
 *    two writes leaves an unlinked note, never a tombstoned memo whose note
 *    was dropped. A failed pass leaves the memo pending; the next trigger
 *    retries. Nothing is ever lost to an error.
 *
 * Deleting a memo note does **not** resurrect it: the daily-note backlink
 * doubles as the tombstone (a memo is only pending while *neither* its note
 * nor its backlink exists). Deleting both regenerates the note on the next
 * pass — the documented way to redo one. The backlink targets the memo's
 * *base name*, declared as a frontmatter alias on the memo note: bases are
 * unique per recording, so two memos stopped within the same second (whose
 * display titles collide) can never tombstone each other, and the link
 * survives a note-title rename.
 *
 * Everything here is local file work — no note content or audio ever leaves
 * the device.
 */

/** Everything derivable from a memo's shared basename. */
export interface AudioMemoIdentity {
  /**
   * The shared basename, e.g. `audio-memo-2026-06-11-153022-845` — also the
   * daily-note wikilink target, resolvable through the memo note's
   * frontmatter alias.
   */
  base: string
  /** Local ISO day it was recorded — the daily note that backlinks it. */
  date: string
  /** The timestamp title of the memo note. */
  title: string
  /** Timestamp alias for the daily-note link, e.g. `Audio memo 15:30`. */
  alias: string
  /** Graph-relative path of the recording under `audio-memos/`. */
  audioPath: string
  /** Graph-relative path of the memo note, `notes/<base>.md`. */
  notePath: string
  /** The recording's MIME type, as stored (derived from the extension). */
  mimeType: string
}

/**
 * File extension per audio MIME type — the on-disk naming of saved memos.
 * An audio-only MP4 *is* an M4A, and `.m4a` is the conventional name for it.
 */
const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
}

/** `audio/mp4;codecs=…` → `audio/mp4` — recorders append codec parameters. */
function baseMimeType(mimeType: string): string {
  return (mimeType.split(';')[0] ?? mimeType).trim().toLowerCase()
}

/** `audio/mp4` ← `m4a` etc. — the inverse of the storage-naming map. */
const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(AUDIO_EXTENSION_BY_MIME).map(([mime, extension]) => [extension, mime]),
)

/**
 * `audio-memos/(audio-memo-<date>-<hhmmss>-<ms>).<ext>`. Milliseconds make
 * back-to-back recordings collision-free; the title drops them.
 */
const MEMO_PATH_RE =
  /^audio-memos\/(audio-memo-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})-\d{3})\.([a-z0-9]+)$/

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function buildIdentity(
  base: string,
  date: string,
  hours: string,
  minutes: string,
  seconds: string,
  extension: string,
): AudioMemoIdentity {
  return {
    base,
    date,
    title: `Audio memo ${date} ${hours}:${minutes}:${seconds}`,
    alias: `Audio memo ${hours}:${minutes}`,
    audioPath: audioMemoPath(`${base}.${extension}`),
    notePath: notePath(base),
    mimeType: MIME_BY_EXTENSION[extension] ?? 'audio/mp4',
  }
}

/** The identity a fresh recording will be stored under (local time). */
export function audioMemoIdentity(recordedAt: Date, mimeType: string): AudioMemoIdentity {
  const date = `${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1, 2)}-${pad(recordedAt.getDate(), 2)}`
  const hours = pad(recordedAt.getHours(), 2)
  const minutes = pad(recordedAt.getMinutes(), 2)
  const seconds = pad(recordedAt.getSeconds(), 2)
  const base = `audio-memo-${date}-${hours}${minutes}${seconds}-${pad(recordedAt.getMilliseconds(), 3)}`
  const extension = AUDIO_EXTENSION_BY_MIME[baseMimeType(mimeType)] ?? 'm4a'
  return buildIdentity(base, date, hours, minutes, seconds, extension)
}

/**
 * Recover a memo's identity from its recording path, or `null` for anything
 * that isn't a well-formed memo recording (a stray file dropped into
 * `audio-memos/` is never touched — reconciliation must not file arbitrary
 * user files).
 */
export function audioMemoFromPath(path: string): AudioMemoIdentity | null {
  const match = MEMO_PATH_RE.exec(path)
  if (match === null) {
    return null
  }
  const [, base, date, hours, minutes, seconds, extension] = match
  if (
    base === undefined ||
    date === undefined ||
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    extension === undefined
  ) {
    return null
  }
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) {
    return null
  }
  try {
    dailyPath(date) // calendar-validates the date the same way the backlink will
  } catch {
    return null
  }
  return buildIdentity(base, date, hours, minutes, seconds, extension)
}

export interface CaptureAudioMemoInput {
  /** The recording, as the recorder produced it. */
  audio: Blob
  /** The recording's MIME type, possibly with codec parameters. */
  mimeType: string
  /** When the recording stopped — names the asset and picks the daily note. */
  recordedAt: Date
  /** `GraphInfo.generation` — pins the write to the issuing graph. */
  generation: number
}

/** Expected failures are data: the caller retries with the same recording. */
export type CaptureAudioMemoOutcome =
  | { ok: true; memo: AudioMemoIdentity }
  | { ok: false; message: string }

/**
 * Persist one recording into the graph — the durable step. Filing it into a
 * note happens later, in {@link reconcileAudioMemos}.
 */
export async function captureAudioMemo(
  input: CaptureAudioMemoInput,
): Promise<CaptureAudioMemoOutcome> {
  const memo = audioMemoIdentity(input.recordedAt, input.mimeType)
  try {
    const encoded = bytesToBase64(new Uint8Array(await input.audio.arrayBuffer()))
    await writeAsset(memo.audioPath, encoded, input.generation)
  } catch (cause) {
    return { ok: false, message: errorMessage(cause) }
  }
  return { ok: true, memo }
}

/** The day's note source at `generation`, where "no note yet" reads as empty. */
async function dailyNoteSource(date: string, generation: number): Promise<string> {
  try {
    return await readNote(dailyPath(date), generation)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      return ''
    }
    throw cause
  }
}

/**
 * Matches the plain and aliased form of the memo's backlink. The probe is the
 * memo's base, never its display title — titles have second precision and a
 * sibling memo from the same second must not read as this memo's tombstone.
 */
function hasBacklink(source: string, memo: AudioMemoIdentity): boolean {
  return source.includes(`[[${memo.base}`)
}

/**
 * Memos awaiting filing, oldest first: a recording under `audio-memos/` with
 * no same-named memo note and no daily-note backlink (the backlink is the
 * tombstone — see the module doc). Every read is pinned to `generation` —
 * recordings, notes, and daily-note tombstones must come from one graph
 * session, never a mix across a switch.
 */
export async function listPendingAudioMemos(generation: number): Promise<AudioMemoIdentity[]> {
  const [recordings, notes] = await Promise.all([
    listDir(AUDIO_MEMOS_DIR, generation),
    listFiles(generation),
  ])
  const existingNotes = new Set(notes.map((file) => file.path))
  const candidates = recordings
    // An iCloud-evicted recording lists under its logical name but its bytes
    // aren't local — leave it pending until downloaded (Plan 21).
    .filter((file) => file.placeholder !== true)
    .map((file) => audioMemoFromPath(file.path))
    .filter((memo): memo is AudioMemoIdentity => memo !== null)
    .filter((memo) => !existingNotes.has(memo.notePath))
    .sort((first, second) => first.base.localeCompare(second.base))
  const pending: AudioMemoIdentity[] = []
  for (const memo of candidates) {
    if (!hasBacklink(await dailyNoteSource(memo.date, generation), memo)) {
      pending.push(memo)
    }
  }
  return pending
}

/**
 * The note declares its base name as an alias so the daily-note link
 * (`[[<base>|…]]`) resolves through the index — and keeps resolving if the
 * user renames the title.
 */
function audioMemoNote(memo: AudioMemoIdentity): string {
  return `---\naliases: [${memo.base}]\n---\n\n# ${memo.title}\n\n[Recording](${memo.audioPath})\n`
}

/** The category note every audio-memo section backlinks. */
const MEMOS_NOTE_TITLE = 'Audio memos'
/**
 * Append the memo's wikilink once under `## [[Audio memos]]`, creating the
 * heading and daily file as needed. The watcher reindexes the direct write;
 * open dirty editors park a conflict instead of being clobbered.
 */
async function ensureDailyBacklink(
  memo: AudioMemoIdentity,
  title: string,
  memosNoteTitle: string,
  generation: number,
): Promise<void> {
  const source = await dailyNoteSource(memo.date, generation)
  if (hasBacklink(source, memo)) {
    return
  }
  const displayTitle = wikiLinkSafe(title) || memo.title
  const link = `- [[${memo.base}|${displayTitle}]]`
  const updated = appendUnderBacklinkedHeading(source, memosNoteTitle, link, [MEMOS_NOTE_TITLE])
  await writeNote(dailyPath(memo.date), updated, generation)
}

/**
 * Why a reconcile pass ended with items still pending. `config` = a required
 * setting is missing (self-heals when settings change); `stale` = the
 * caller's abort gate fired; anything else is the failing step's error kind
 * (`network` while offline is the expected, silent case).
 */
export interface ReconcileStop {
  reason: 'config' | 'stale' | AppError['kind']
  message: string
}

/**
 * Whether a {@link ReconcileStop} is an expected, self-healing stop that a
 * background controller should swallow rather than surface to the user:
 * `network` (offline — retries on the next trigger), `config` (a setting is
 * missing — the work waits), or `stale` (a graph switch tore the pass down).
 * Any other reason is an unexpected failure worth surfacing or logging.
 * Shared by every background reconcile loop (capture, audio memos).
 */
export function isSilentStop(stopped: ReconcileStop): boolean {
  return stopped.reason === 'network' || stopped.reason === 'config' || stopped.reason === 'stale'
}

export interface ReconcileAudioMemosInput {
  /** `GraphInfo.generation` — pins every write to the issuing graph. */
  generation: number
  /** Abort gate, checked between memos (graph switch / unmount). */
  isStale?: () => boolean
  /** Observes how many memos need filing, before work starts. */
  onPending?: (count: number) => void
}

export interface ReconcileAudioMemosOutcome {
  /** Memos that had no note when the pass started. */
  pending: number
  /** Memos this pass filed into a note and backlinked. */
  filed: number
  /** Why memos remain pending, or `null` when the pass drained. */
  stopped: ReconcileStop | null
}

/**
 * File every pending memo: ensure the category target, write the memo note
 * (title + a link to the recording), then append the daily backlink. The
 * memo note is written **first** — it carries the result, so a failure
 * between the two writes leaves an unlinked note (recoverable from All
 * Notes), never a backlink-tombstoned memo whose note was dropped. Any
 * failure stops the pass — one memo's write error means the rest would fail
 * the same way. Never throws.
 */
export async function reconcileAudioMemos(
  input: ReconcileAudioMemosInput,
): Promise<ReconcileAudioMemosOutcome> {
  let pending: AudioMemoIdentity[]
  try {
    pending = await listPendingAudioMemos(input.generation)
  } catch (cause) {
    return {
      pending: 0,
      filed: 0,
      stopped: { reason: toAppError(cause).kind, message: errorMessage(cause) },
    }
  }
  input.onPending?.(pending.length)
  if (pending.length === 0) {
    return { pending: 0, filed: 0, stopped: null }
  }

  let filed = 0
  let memosNoteTitle: string | null = null
  const stale = (): boolean => input.isStale?.() === true
  const stalled = (): ReconcileAudioMemosOutcome => ({
    pending: pending.length,
    filed,
    stopped: { reason: 'stale', message: 'the graph session ended mid-pass' },
  })
  for (const memo of pending) {
    if (stale()) {
      return stalled()
    }
    try {
      memosNoteTitle ??= await ensureBacklinkTarget(MEMOS_NOTE_TITLE, input.generation)
      if (stale()) {
        return stalled()
      }
      await writeNote(memo.notePath, audioMemoNote(memo), input.generation)
      await ensureDailyBacklink(memo, memo.title, memosNoteTitle, input.generation)
      filed += 1
    } catch (cause) {
      return {
        pending: pending.length,
        filed,
        stopped: { reason: toAppError(cause).kind, message: errorMessage(cause) },
      }
    }
  }
  return { pending: pending.length, filed, stopped: null }
}
