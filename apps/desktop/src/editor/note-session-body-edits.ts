import {
  appendBlock,
  editTaskLine,
  removeTaskLine,
  taskLineToBullet,
  toggleTaskMarker,
} from '@dayjot/core'
import { splitDoc } from './note-session-doc'
import type { NoteSession } from './note-session-types'

/** The live document as a session holds it: exact frontmatter bytes + editor body. */
export interface SessionDocument {
  readonly header: string
  readonly body: string
}

/** What out-of-editor body edits need from the note session. */
export interface BodyEditHost {
  /**
   * False when the session can't safely take a body edit right now (no write
   * channel, disposed, protected/read-only, still loading, or an external
   * change still being merged), so the caller refuses rather than clobber the
   * buffer via disk.
   */
  canEdit: () => boolean
  document: () => SessionDocument
  /**
   * Replace the live document — the open editor included — and recompute
   * dirtiness; `clearError` also drops a surfaced save error. Returns whether
   * the document now differs from disk.
   */
  replace: (next: SessionDocument, options?: { clearError?: boolean }) => boolean
  /** Persist now; resolves even when the write failed (see `error`). */
  flush: () => Promise<void>
  /** The surfaced save error, when the last write failed. */
  error: () => string | null
}

export type BodyEdits = Pick<
  NoteSession,
  'commitTaskToggle' | 'commitTaskEdit' | 'commitTaskRemove' | 'commitTaskToBullet' | 'commitBodyAppend'
>

/**
 * Out-of-editor body edits (the Tasks view's toggle / edit / delete, the
 * suggested-contact card's append), applied to the live document so
 * concurrent editor edits survive, then landed now so the Tasks view
 * refreshes promptly.
 */
export function createBodyEdits(host: BodyEditHost): BodyEdits {
  /**
   * Apply one edit transactionally. `transform` runs before any mutation, so a
   * `TaskStaleError` (the marker can't be located) propagates with nothing
   * changed. And the write is all-or-nothing: a failed flush reverts the
   * in-memory edit so the editor and the Tasks list can't diverge, then
   * re-throws the failure.
   */
  async function commit(transform: (full: string) => string): Promise<boolean> {
    if (!host.canEdit()) {
      return false
    }
    const previous = host.document()
    const next = splitDoc(transform(previous.header + previous.body))
    // A no-op edit (transform changed nothing) writes nothing, so a *prior*
    // surfaced save error must not be mistaken for this edit's failure.
    const shouldPersist = host.replace(next)
    await host.flush()
    const failure = host.error()
    if (shouldPersist && failure !== null) {
      host.replace(previous, { clearError: true })
      throw new Error(failure)
    }
    return true
  }

  return {
    commitTaskToggle: (task) => commit((full) => toggleTaskMarker(full, task).source),
    commitTaskEdit: (task, content) => commit((full) => editTaskLine(full, task, content)),
    commitTaskRemove: (task) => commit((full) => removeTaskLine(full, task)),
    commitTaskToBullet: (task) => commit((full) => taskLineToBullet(full, task)),
    commitBodyAppend: (block) =>
      block.trim() === '' ? Promise.resolve(false) : commit((full) => appendBlock(full, block)),
  }
}
