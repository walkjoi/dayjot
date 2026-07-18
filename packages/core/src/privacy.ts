/**
 * The `private: true` hard block (product principle): a note flagged private
 * must never have its content sent to any external service — publishing,
 * sharing, anything outbound. This is the shared guard every outbound
 * feature calls before shipping note content.
 */

/** What the cloud guard needs to know about a note. */
export interface CloudSendable {
  /** Graph-relative path (for the error message). */
  path: string
  /** The note's live `private: true` frontmatter flag. */
  isPrivate: boolean
}

/** Thrown when a private note would otherwise reach an external service. */
export class PrivateNoteError extends Error {
  constructor(path: string) {
    super(`"${path}" is marked private and cannot be sent to an external service`)
    this.name = 'PrivateNoteError'
  }
}

/** Type guard for {@link PrivateNoteError} across module boundaries. */
export function isPrivateNoteError(value: unknown): value is PrivateNoteError {
  return value instanceof Error && value.name === 'PrivateNoteError'
}

/**
 * Assert that `note`'s content may leave the device. Throws
 * {@link PrivateNoteError} when the note is private — callers either let the
 * refusal propagate or turn it into a structured "this note is private"
 * answer, but they can never accidentally ship the body.
 */
export function assertCloudAllowed(note: CloudSendable): void {
  if (note.isPrivate) {
    throw new PrivateNoteError(note.path)
  }
}
