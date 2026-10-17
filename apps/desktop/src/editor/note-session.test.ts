import { parseNote, TaskStaleError, type TaskMarker, type UnsavedMerge } from '@dayjot/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoteSession, type NoteSessionIo, type NoteSessionSnapshot } from './note-session'
import type { RoundTripFidelity } from './roundtrip'

/** The first task's {@link TaskMarker} as the index records it. */
function firstTask(source: string): TaskMarker {
  const [task] = parseNote({ path: 'notes/a.md', source }).tasks
  return { markerOffset: task!.markerOffset, raw: task!.raw }
}

/**
 * Direct tests of the document state machine, no React. The full pipeline
 * (load, debounce, echo detection, merging, protection) is covered
 * end-to-end through the hook in `use-note-document.test.tsx`; these pin the
 * session-level contracts the hook can't observe directly.
 */

/**
 * Stand-in for the Rust merge (`note_merge_unsaved`, whose algorithm is tested
 * there): an unchanged side takes the other, two appends to the base union
 * theirs-first, anything else conflicts. Enough to drive the state machine.
 */
async function fakeMerge(base: string, ours: string, theirs: string): Promise<UnsavedMerge> {
  if (ours === base || ours === theirs) {
    return { kind: 'merged', content: theirs }
  }
  if (theirs === base) {
    return { kind: 'merged', content: ours }
  }
  if (ours.startsWith(base) && theirs.startsWith(base)) {
    return { kind: 'merged', content: theirs + ours.slice(base.length) }
  }
  return {
    kind: 'conflicted',
    content: `<<<<<<< this device\n${ours}=======\n${theirs}>>>>>>> other device\n`,
  }
}

/** A merge that waits until released — the window where the user keeps typing. */
function gatedMerge(): { merge: NoteSessionIo['merge']; release: () => void } {
  const waiting: Array<() => void> = []
  return {
    merge: (base, ours, theirs) =>
      new Promise<void>((resolve) => {
        waiting.push(resolve)
      }).then(() => fakeMerge(base, ours, theirs)),
    release: () => {
      for (const resolve of waiting.splice(0)) {
        resolve()
      }
    },
  }
}

const isMarked = (markdown: string): RoundTripFidelity =>
  markdown.includes('<<<<<<<') ? 'lossy' : 'exact'

interface Harness {
  snapshots: NoteSessionSnapshot[]
  writes: Array<{ path: string; contents: string }>
  applied: string[]
  contents: Array<{ content: string; origin: string }>
  merges: Array<{ base: string; ours: string; theirs: string }>
  /** `null` deletes the file: subsequent reads throw the notFound AppError. */
  setDisk: (contents: string | null) => void
  /** While set, writes reject with this message (the save-failure seam). */
  failWrites: (message: string | null) => void
  session: ReturnType<typeof createNoteSession>
}

function harness(options?: {
  write?: false
  classify?: (markdown: string) => RoundTripFidelity
  /** `null` simulates a missing file: reads throw the notFound AppError. */
  disk?: string | null
  createIfMissing?: boolean
  missingSeed?: string
  reconcilePendingEditorInput?: () => void
  merge?: NoteSessionIo['merge']
}): Harness {
  const snapshots: NoteSessionSnapshot[] = []
  const writes: Array<{ path: string; contents: string }> = []
  const applied: string[] = []
  const contents: Array<{ content: string; origin: string }> = []
  const merges: Array<{ base: string; ours: string; theirs: string }> = []
  const merge = options?.merge ?? fakeMerge
  let disk = options?.disk === undefined ? '# Hello\n' : options.disk
  let writeFailure: string | null = null
  const session = createNoteSession({
    path: 'notes/a.md',
    io: {
      read: async () => {
        if (disk === null) {
          throw { kind: 'notFound', message: 'missing' } // AppError shape
        }
        return disk
      },
      write:
        options?.write === false
          ? null
          : async (path, contents) => {
              if (writeFailure !== null) {
                throw new Error(writeFailure)
              }
              writes.push({ path, contents })
              disk = contents
            },
      merge: (base, ours, theirs) => {
        merges.push({ base, ours, theirs })
        return merge(base, ours, theirs)
      },
    },
    classify: options?.classify ?? (() => 'exact'),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    applyContent: (markdown) => {
      applied.push(markdown)
    },
    ...(options?.reconcilePendingEditorInput === undefined
      ? {}
      : { reconcilePendingEditorInput: options.reconcilePendingEditorInput }),
    onContent: (content, origin) => {
      contents.push({ content, origin })
    },
    createIfMissing: options?.createIfMissing,
    missingSeed: options?.missingSeed,
    saveDebounceMs: 10,
  })
  return {
    snapshots,
    writes,
    applied,
    contents,
    merges,
    setDisk: (contents) => {
      disk = contents
    },
    failWrites: (message) => {
      writeFailure = message
    },
    session,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settled(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50)
}

describe('createNoteSession', () => {
  it('tracks dirtiness but never writes without a write capability', async () => {
    const { session, writes, snapshots } = harness({ write: false })
    session.load()
    await settled()

    session.editorChanged('# Edited\n')
    session.flush()
    await settled()

    expect(writes).toEqual([])
    expect(snapshots.at(-1)?.dirty).toBe(true) // edits are not silently "clean"
  })

  it('dispose flushes the pending edit but emits no further snapshots', async () => {
    const { session, writes, snapshots } = harness()
    session.load()
    await settled()

    session.editorChanged('# Final\n')
    const emittedBeforeDispose = snapshots.length
    session.dispose()
    await settled()

    expect(writes).toEqual([{ path: 'notes/a.md', contents: '# Final\n' }])
    expect(snapshots.length).toBe(emittedBeforeDispose)
  })

  it('reconciles pending editor input before a flush snapshots the buffer', async () => {
    let target: ReturnType<typeof createNoteSession> | null = null
    const reconcilePendingEditorInput = vi.fn(() => {
      target?.editorChanged('# 🧠 Business ideas\n')
    })
    const { session, writes } = harness({ reconcilePendingEditorInput })
    target = session
    session.load()
    await settled()

    session.editorChanged('# Business ideas\n')
    await session.flush()

    expect(reconcilePendingEditorInput).toHaveBeenCalledOnce()
    expect(writes).toEqual([
      { path: 'notes/a.md', contents: '# 🧠 Business ideas\n' },
    ])
  })

  it('discard detaches without writing — even with a pending edit (delete path)', async () => {
    const { session, writes } = harness()
    session.load()
    await settled()

    session.editorChanged('# Unsaved edit\n')
    session.discard()
    await settled()

    // Nothing written: the file is being deleted, so a flush would recreate it.
    expect(writes).toEqual([])

    // The pane tears down via flush() → dispose() (document-binding); neither
    // may write after a discard, or the trashed file would come back.
    await session.flush()
    session.dispose()
    await settled()
    expect(writes).toEqual([])
  })

  it('does not re-emit identical snapshots', async () => {
    const { session, snapshots } = harness()
    session.load()
    await vi.advanceTimersByTimeAsync(0)

    const afterLoad = snapshots.length
    session.editorChanged('# Same edit\n')
    session.editorChanged('# Same edit\n')
    expect(snapshots.length).toBe(afterLoad + 1) // one dirty transition, not two
  })

  it('merges an external change into unsaved edits, keeping both sides', async () => {
    const base = '# Day\n\nmorning\n'
    const ours = '# Day\n\nmorning\nevening\n'
    const theirs = '# Day\n\nmorning\nafternoon\n'
    const merged = '# Day\n\nmorning\nafternoon\nevening\n'
    const h = harness({ disk: base })
    h.session.load()
    await settled()

    h.session.editorChanged(ours) // unsaved
    h.setDisk(theirs) // a sync pull lands first
    h.session.externalChanged()
    await settled()

    expect(h.merges).toEqual([{ base, ours, theirs }])
    expect(h.applied.at(-1)).toBe(merged) // the editor shows both sides…
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: merged }]) // …and so does the file
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
    // The rename tracker sees their side as external ground truth before the
    // merged save, so a title they changed is never taken for the user's.
    expect(h.contents.slice(-2)).toEqual([
      { content: theirs, origin: 'external' },
      { content: merged, origin: 'saved' },
    ])
  })

  it('an external change identical to the unsaved buffer settles clean without a write', async () => {
    const h = harness()
    h.session.load()
    await settled()

    // The user types X while the same X lands on disk (another device synced
    // the identical edit): the file already holds the merge.
    h.session.editorChanged('# Same on both\n')
    h.setDisk('# Same on both\n')
    h.session.externalChanged()
    await settled()
    expect(h.writes).toEqual([])
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
    expect(h.session.content()).toBe('# Same on both\n')
  })

  it('a save never writes over an external change still being merged', async () => {
    const gate = gatedMerge()
    const h = harness({ disk: 'a\n', merge: gate.merge })
    h.session.load()
    await settled()

    h.session.editorChanged('a\nmine\n')
    h.setDisk('a\ntheirs\n')
    h.session.externalChanged()
    await settled()
    // Well past the save debounce, and a flush (blur) on top: nothing lands
    // while their side is unmerged — it would be overwritten.
    void h.session.flush()
    await settled()
    expect(h.writes).toEqual([])
    expect(h.session.hasUnmergedChange()).toBe(true)

    gate.release()
    await settled()
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: 'a\ntheirs\nmine\n' }])
    expect(h.session.hasUnmergedChange()).toBe(false)
  })

  it('keystrokes typed while the merge is out are merged too, never dropped', async () => {
    const gate = gatedMerge()
    const h = harness({ disk: 'a\n', merge: gate.merge })
    h.session.load()
    await settled()

    h.session.editorChanged('a\nmine\n')
    h.setDisk('a\ntheirs\n')
    h.session.externalChanged()
    await settled()
    h.session.editorChanged('a\nmine, and more\n') // typed during the merge
    gate.release()
    await settled()
    gate.release() // the re-run against the newer buffer
    await settled()

    expect(h.merges.map((call) => call.ours)).toEqual(['a\nmine\n', 'a\nmine, and more\n'])
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: 'a\ntheirs\nmine, and more\n' }])
  })

  it('a newer external change during a merge is merged instead of the older one', async () => {
    const gate = gatedMerge()
    const h = harness({ disk: 'a\n', merge: gate.merge })
    h.session.load()
    await settled()

    h.session.editorChanged('a\nmine\n')
    h.setDisk('a\ntheirs\n')
    h.session.externalChanged()
    await settled()
    h.setDisk('a\ntheirs, newer\n')
    h.session.externalChanged()
    await settled()
    gate.release()
    await settled()
    gate.release()
    await settled()

    expect(h.merges.at(-1)?.theirs).toBe('a\ntheirs, newer\n')
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: 'a\ntheirs, newer\nmine\n' }])
  })

  it('overlapping edits land as conflict markers and open the read-only review', async () => {
    const h = harness({ disk: 'line\n', classify: isMarked })
    h.session.load()
    await settled()

    h.session.editorChanged('my line\n')
    h.setDisk('their line\n')
    h.session.externalChanged()
    await settled()

    const marked = '<<<<<<< this device\nmy line\n=======\ntheir line\n>>>>>>> other device\n'
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: marked }])
    const after = h.snapshots.at(-1)
    expect(after?.protected).toBe(true)
    expect(after?.initialContent).toBe(marked)
    expect(after?.dirty).toBe(false)
    expect(h.applied).toEqual([]) // markers never enter the live editor
  })

  it('a failed merge keeps the change pending: nothing overwrites it, the next save retries', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let failures = 1
      const h = harness({
        disk: 'a\n',
        merge: async (base, ours, theirs) => {
          if (failures > 0) {
            failures -= 1
            throw new Error('merge failed')
          }
          return fakeMerge(base, ours, theirs)
        },
      })
      h.session.load()
      await settled()

      h.session.editorChanged('a\nmine\n')
      h.setDisk('a\ntheirs\n')
      h.session.externalChanged()
      await settled()
      expect(h.snapshots.at(-1)?.error).toBe('merge failed')
      expect(h.writes).toEqual([])

      h.session.editorChanged('a\nmine!\n') // the next save retries the merge
      await settled()
      expect(h.writes).toEqual([{ path: 'notes/a.md', contents: 'a\ntheirs\nmine!\n' }])
      expect(h.snapshots.at(-1)?.error).toBeNull()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('re-gates protection when external content stops being representable', async () => {
    const lossyWhenTasks = (markdown: string): RoundTripFidelity =>
      markdown.includes('+ [ ]') ? 'lossy' : 'exact'
    const { session, snapshots, setDisk } = harness({ classify: lossyWhenTasks })
    session.load()
    await settled()
    expect(snapshots.at(-1)?.protected).toBe(false)

    setDisk('+ [ ] now has tasks\n')
    session.externalChanged()
    await settled()
    expect(snapshots.at(-1)?.protected).toBe(true)
    expect(snapshots.at(-1)?.initialContent).toBe('+ [ ] now has tasks\n')
  })
})

describe('frontmatter ownership (Plan 07b)', () => {
  const FM = '---\naliases:\n  - Old\n---\n'

  it('the editor sees only the body; classification gates on the body', async () => {
    // A joined round-trip would classify lossy (meowdown mangles ---) — the
    // session must split first, or every frontmatter note opens read-only.
    const h = harness({
      disk: `${FM}# Hello\n`,
      classify: (markdown) => (markdown.includes('---') ? 'lossy' : 'exact'),
    })
    h.session.load()
    await vi.runAllTimersAsync()
    const ready = h.snapshots.at(-1)
    expect(ready?.status).toBe('ready')
    expect(ready?.protected).toBe(false)
    expect(ready?.initialContent).toBe('# Hello\n')
  })

  it('a protected note shows the full file, frontmatter included', async () => {
    const h = harness({
      disk: `${FM}+ [ ] lossy body\n`,
      classify: (markdown) => (markdown.includes('+ [ ]') ? 'lossy' : 'exact'),
    })
    h.session.load()
    await vi.runAllTimersAsync()
    const ready = h.snapshots.at(-1)
    expect(ready?.protected).toBe(true)
    // The read-only view's job is honest display of a file we refuse to
    // touch — hiding the frontmatter would misrepresent it.
    expect(ready?.initialContent).toBe(`${FM}+ [ ] lossy body\n`)
  })

  it('saves rejoin the exact header bytes around the edited body', async () => {
    const h = harness({ disk: `${FM}# Hello\n` })
    h.session.load()
    await vi.runAllTimersAsync()
    h.session.editorChanged('# Hello edited\n')
    await vi.runAllTimersAsync()
    expect(h.writes.at(-1)?.contents).toBe(`${FM}# Hello edited\n`)
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
  })

  it('updateFrontmatter patches the header and saves without touching the editor', async () => {
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await vi.runAllTimersAsync()
    h.session.updateFrontmatter({ aliases: ['Old Title'] })
    await vi.runAllTimersAsync()
    const written = h.writes.at(-1)?.contents ?? ''
    expect(written).toContain('aliases:')
    expect(written).toContain('Old Title')
    expect(written.endsWith('# Hello\n')).toBe(true)
    expect(h.applied).toEqual([]) // the editor was never reloaded
  })

  it('pinning writes the flag; unpinning removes the key, not `pinned: false`', async () => {
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await vi.runAllTimersAsync()
    h.session.updateFrontmatter({ pinned: true })
    await vi.runAllTimersAsync()
    expect(h.writes.at(-1)?.contents).toBe('---\npinned: true\n---\n# Hello\n')

    h.session.updateFrontmatter({ pinned: false })
    await vi.runAllTimersAsync()
    // The only metadata was the pin — the note returns to no frontmatter at all.
    expect(h.writes.at(-1)?.contents).toBe('# Hello\n')
    expect(h.applied).toEqual([]) // the editor was never reloaded
  })

  it('marking private writes the flag; un-marking removes the key, not `private: false`', async () => {
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await vi.runAllTimersAsync()
    h.session.updateFrontmatter({ private: true })
    await vi.runAllTimersAsync()
    expect(h.writes.at(-1)?.contents).toBe('---\nprivate: true\n---\n# Hello\n')

    h.session.updateFrontmatter({ private: false })
    await vi.runAllTimersAsync()
    // Same contract as the pin: not-private is the absence of the flag.
    expect(h.writes.at(-1)?.contents).toBe('# Hello\n')
    expect(h.applied).toEqual([]) // the editor was never reloaded
  })

  it('an external frontmatter-only change adopts cleanly', async () => {
    const h = harness({ disk: `${FM}# Hello\n` })
    h.session.load()
    await vi.runAllTimersAsync()
    h.setDisk(`---\naliases:\n  - Newer\n---\n# Hello\n`)
    h.session.externalChanged()
    await vi.runAllTimersAsync()
    // Next save preserves the adopted header.
    h.session.editorChanged('# Hello!\n')
    await vi.runAllTimersAsync()
    expect(h.writes.at(-1)?.contents).toBe('---\naliases:\n  - Newer\n---\n# Hello!\n')
  })

  it('a frontmatter patch made while a merge is out rides the merged content', async () => {
    // The rename coordinator's alias can arrive mid-merge: it patches the
    // buffer's header, so the merge re-runs and the alias lands with it.
    const gate = gatedMerge()
    const h = harness({ merge: gate.merge })
    h.session.load()
    await settled()
    h.session.editorChanged('# Mine\n')
    h.setDisk('# Theirs\n')
    h.session.externalChanged()
    await settled()

    expect(h.session.updateFrontmatter({ aliases: ['Old Title'] })).toBe(true)
    gate.release()
    await settled()
    gate.release()
    await settled()
    const written = h.writes.at(-1)?.contents ?? ''
    expect(written).toContain('Old Title')
    expect(written).toContain('# Mine')
    expect(written).toContain('# Theirs')
  })

  it('commitFrontmatter lands the patch immediately on a clean session', async () => {
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await vi.runAllTimersAsync()
    await expect(h.session.commitFrontmatter({ pinned: true })).resolves.toBe(true)
    // Flushed, not riding the save debounce.
    expect(h.writes.at(-1)?.contents).toBe('---\npinned: true\n---\n# Hello\n')
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
  })

  it('commitFrontmatter declines when the session has no write channel', async () => {
    // No graph generation → no `io.write`. The patch can't land, so report
    // false rather than the in-memory success that would let publish/pin/private
    // skip their disk fallback and treat an unwritten flag as persisted.
    const h = harness({ disk: '# Hello\n', write: false })
    h.session.load()
    await vi.runAllTimersAsync()

    await expect(h.session.commitFrontmatter({ pinned: true })).resolves.toBe(false)
    expect(h.writes).toEqual([])
  })

  it('commitFrontmatter during a merge resolves once the patch has landed with it', async () => {
    const gate = gatedMerge()
    const h = harness({ disk: 'a\n', merge: gate.merge })
    h.session.load()
    await settled()
    h.session.editorChanged('a\nmine\n')
    h.setDisk('a\ntheirs\n')
    h.session.externalChanged()
    await settled()

    const committed = h.session.commitFrontmatter({ pinned: true })
    gate.release()
    await settled()
    gate.release()
    await settled()
    await expect(committed).resolves.toBe(true)
    const written = h.writes.at(-1)?.contents ?? ''
    expect(written).toContain('pinned: true')
    expect(written).toContain('mine')
    expect(written).toContain('theirs')
  })

  it('onContent reports full joined content with the right origins', async () => {
    const h = harness({ disk: `${FM}# Hello\n` })
    h.session.load()
    await vi.runAllTimersAsync()
    h.session.editorChanged('# Renamed\n')
    await vi.runAllTimersAsync()
    h.setDisk(`${FM}# External\n`)
    h.session.externalChanged()
    await vi.runAllTimersAsync()
    expect(h.contents.map((c) => c.origin)).toEqual(['load', 'saved', 'external'])
    expect(h.contents[1]!.content).toBe(`${FM}# Renamed\n`)
  })
})

describe('missing-note seed (new ordinary notes)', () => {
  // The empty H1 the new-note flow seeds (`untitledNoteSeed` body): the
  // caret lands in it and typing names the note.
  const SEED = '#\n'

  it('a missing note opens ready with the seed, marked missing, and writes nothing', async () => {
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    const ready = h.snapshots.at(-1)
    expect(ready?.status).toBe('ready')
    expect(ready?.missing).toBe(true)
    expect(ready?.initialContent).toBe(SEED)
    expect(ready?.dirty).toBe(false)
    expect(h.writes).toEqual([]) // opening never litters the graph
    // The rename tracker baselines on the real (empty) disk content, never
    // the seed, so the first authored title is a birth, not a rename.
    expect(h.contents).toEqual([{ content: '', origin: 'load' }])
  })

  it('the editor echoing the seed back stays clean — no file is created', async () => {
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    // Mount-time serialization: the editor reports the document it was seeded
    // with. That is not a user edit and must not reach disk.
    h.session.editorChanged(SEED)
    await h.session.flush()
    await settled()

    expect(h.writes).toEqual([])
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
  })

  it('clearing the seed back to empty writes nothing — the note stays unborn', async () => {
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    // The user deletes the seeded empty title without typing a replacement:
    // an empty unwritten note must not be created on disk.
    h.session.editorChanged('')
    await h.session.flush()
    await settled()

    expect(h.writes).toEqual([])
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
    expect(h.snapshots.at(-1)?.missing).toBe(true)

    // Typing real content afterwards still births the file.
    h.session.editorChanged('# Plans\n')
    await settled()
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: '# Plans\n' }])
    expect(h.snapshots.at(-1)?.missing).toBe(false)
  })

  it('a real edit creates the file with the full content and clears missing', async () => {
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    h.session.editorChanged('# My Note\n\nFirst line.\n')
    await settled()

    expect(h.writes).toEqual([
      { path: 'notes/a.md', contents: '# My Note\n\nFirst line.\n' },
    ])
    expect(h.snapshots.at(-1)?.missing).toBe(false)
    expect(h.snapshots.at(-1)?.dirty).toBe(false)
  })

  it('a missing note without a seed opens empty (the lazy daily contract)', async () => {
    const h = harness({ disk: null, createIfMissing: true })
    h.session.load()
    await settled()

    const ready = h.snapshots.at(-1)
    expect(ready?.status).toBe('ready')
    expect(ready?.missing).toBe(true)
    expect(ready?.initialContent).toBe('')
    expect(h.writes).toEqual([])
  })

  it('an existing file ignores the seed entirely', async () => {
    const h = harness({ disk: '# Hello\n', createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    const ready = h.snapshots.at(-1)
    expect(ready?.missing).toBe(false)
    expect(ready?.initialContent).toBe('# Hello\n')
    expect(h.contents).toEqual([{ content: '# Hello\n', origin: 'load' }])
  })

  it('an external write while the seed is showing adopts cleanly and clears missing', async () => {
    // Another device/process creates the file while the seeded buffer is open
    // and untouched: nothing to merge — the buffer was never dirty.
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()

    h.setDisk('# Created elsewhere\n')
    h.session.externalChanged()
    await settled()

    const ready = h.snapshots.at(-1)
    expect(ready?.missing).toBe(false)
    expect(h.applied).toEqual(['# Created elsewhere\n'])
    expect(h.writes).toEqual([])
  })

  it('an external write matching the seed verbatim still clears missing', async () => {
    // The read equals the adopted baseline, so there is nothing to reconcile —
    // but the file exists on disk now, and the snapshot must say so.
    const h = harness({ disk: null, createIfMissing: true, missingSeed: SEED })
    h.session.load()
    await settled()
    expect(h.snapshots.at(-1)?.missing).toBe(true)

    h.setDisk(SEED)
    h.session.externalChanged()
    await settled()

    const ready = h.snapshots.at(-1)
    expect(ready?.missing).toBe(false)
    expect(h.applied).toEqual([]) // content unchanged: no editor reload
    expect(h.writes).toEqual([])
  })

  it('an external delete reconciles to a no-op: the buffer survives, edits still save', async () => {
    // createIfMissing applies only to the initial load; a deletion mid-session
    // must not error the session or empty the editor — the buffer is the user's.
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await settled()

    h.setDisk(null) // deleted out from under us
    h.session.externalChanged()
    await settled()

    const after = h.snapshots.at(-1)
    expect(after?.status).toBe('ready')
    expect(after?.error).toBeNull()
    expect(h.applied).toEqual([]) // nothing pushed into the editor

    // The next edit recreates the file through the normal save path.
    h.session.editorChanged('# Hello again\n')
    await settled()
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: '# Hello again\n' }])
  })

  it('a delete racing unsaved edits neither merges nor drops them', async () => {
    const h = harness({ disk: '# Hello\n' })
    h.session.load()
    await settled()

    h.session.editorChanged('# Unsaved\n')
    h.setDisk(null)
    h.session.externalChanged() // read fails: nothing to merge against
    await settled()

    const after = h.snapshots.at(-1)
    expect(after?.dirty).toBe(false) // the debounced save already landed…
    expect(h.writes.at(-1)).toEqual({ path: 'notes/a.md', contents: '# Unsaved\n' }) // …recreating the file
  })

  it('a failed save surfaces the error and a later save clears it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const h = harness()
      h.session.load()
      await settled()

      h.failWrites('disk full')
      h.session.editorChanged('# Edited\n')
      await settled()

      const failed = h.snapshots.at(-1)
      expect(failed?.error).toBe('disk full')
      expect(failed?.dirty).toBe(true) // the edit is kept, not lost
      expect(h.writes).toEqual([])

      // The disk recovers; the next edit re-enters the pipeline and the
      // landed save resolves the surfaced error.
      h.failWrites(null)
      h.session.editorChanged('# Edited more\n')
      await settled()

      const recovered = h.snapshots.at(-1)
      expect(recovered?.error).toBeNull()
      expect(recovered?.dirty).toBe(false)
      expect(h.writes).toEqual([{ path: 'notes/a.md', contents: '# Edited more\n' }])
    } finally {
      consoleError.mockRestore()
    }
  })

  it('flush after a failed save retries the same buffer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const h = harness()
      h.session.load()
      await settled()

      h.failWrites('disk full')
      h.session.editorChanged('# Edited\n')
      await settled()
      expect(h.snapshots.at(-1)?.error).toBe('disk full')

      h.failWrites(null)
      await h.session.flush() // a settle point (blur/quit) retries without a new edit
      expect(h.writes).toEqual([{ path: 'notes/a.md', contents: '# Edited\n' }])
      expect(h.snapshots.at(-1)?.error).toBeNull()
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('default-bullet editor seed (daily notes)', () => {
  // The `editorDefaultBullet` feature seeds the *editor* of an empty daily note
  // with `- `; meowdown serializes that lone empty bullet back to `"\n"`. The
  // session has no `missingSeed` for daily notes, so the only way the bullet can
  // reach it is a mount-time serialization — which must be treated as the empty
  // note it is, never written, so a future placeholder stays uncreated.
  it('an empty-bullet serialization on a missing daily note writes nothing', async () => {
    const h = harness({ disk: null, createIfMissing: true })
    h.session.load()
    await settled()
    expect(h.snapshots.at(-1)?.missing).toBe(true)

    h.session.editorChanged('\n') // docToMarkdown of an unedited empty bullet
    await h.session.flush()
    await settled()

    expect(h.writes).toEqual([]) // the placeholder is still not on disk
    expect(h.snapshots.at(-1)?.missing).toBe(true)
    expect(h.snapshots.at(-1)?.dirty).toBe(false)

    // Typing into the bullet births the file with the real content.
    h.session.editorChanged('- groceries\n')
    await settled()
    expect(h.writes).toEqual([{ path: 'notes/a.md', contents: '- groceries\n' }])
    expect(h.snapshots.at(-1)?.missing).toBe(false)
  })
})

describe('retarget (Plan 17)', () => {
  it('rebinds reads and writes to the new path without touching document state', async () => {
    const h = harness()
    h.session.load()
    await vi.waitFor(() => expect(h.snapshots.at(-1)?.status).toBe('ready'))

    h.session.editorChanged('# Hello\n\nfirst edit\n')
    await h.session.flush()
    expect(h.writes.at(-1)?.path).toBe('notes/a.md')

    h.session.retarget('notes/hello.md')
    expect(h.session.path).toBe('notes/hello.md')
    // The buffer carried over: not dirty, nothing rewritten on retarget alone.
    expect(h.snapshots.at(-1)?.dirty).toBe(false)

    h.session.editorChanged('# Hello\n\nsecond edit\n')
    await h.session.flush()
    expect(h.writes.at(-1)).toEqual({
      path: 'notes/hello.md',
      contents: '# Hello\n\nsecond edit\n',
    })
  })

  it('keeps frontmatter ownership across a retarget', async () => {
    const h = harness({ disk: '---\nid: 01abc\n---\n# Hello\n' })
    h.session.load()
    await vi.waitFor(() => expect(h.snapshots.at(-1)?.status).toBe('ready'))

    h.session.retarget('notes/hello.md')
    h.session.editorChanged('# Hello\n\nbody\n')
    await h.session.flush()
    // The exact header bytes ride along to the new path.
    expect(h.writes.at(-1)).toEqual({
      path: 'notes/hello.md',
      contents: '---\nid: 01abc\n---\n# Hello\n\nbody\n',
    })
  })
})

describe('commitTaskToggle', () => {
  it('toggles the marker while preserving unsaved edits, and reflects it in the editor', async () => {
    const source = '# Todo\n\n+ [ ] buy milk\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    // The user appends a line below the task — unsaved when the toggle arrives.
    h.session.editorChanged('# Todo\n\n+ [ ] buy milk\n\njot\n')
    expect(h.snapshots.at(-1)?.dirty).toBe(true)

    const applied = await h.session.commitTaskToggle(firstTask(source))
    expect(applied).toBe(true)
    // The write carries both the unsaved edit and the toggled marker.
    expect(h.writes.at(-1)?.contents).toBe('# Todo\n\n+ [x] buy milk\n\njot\n')
    // The open editor was updated to show the toggled checkbox.
    expect(h.applied.at(-1)).toBe('# Todo\n\n+ [x] buy milk\n\njot\n')
  })

  it('toggles a clean note (frontmatter offset intact) and writes only the marker', async () => {
    const source = '---\nid: 01abc\n---\n+ [ ] ship it\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskToggle(firstTask(source))).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('---\nid: 01abc\n---\n+ [x] ship it\n')
  })

  it('refuses (returns false) a protected note rather than write', async () => {
    const h = harness({ disk: '+ [ ] x\n', classify: () => 'lossy' })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskToggle(firstTask('+ [ ] x\n'))).toBe(false)
    expect(h.writes).toEqual([])
  })

  it('refuses (returns false) while an external change is being merged', async () => {
    const source = '+ [ ] x\n'
    const gate = gatedMerge()
    const h = harness({ disk: source, merge: gate.merge })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] x edited\n') // dirty
    h.setDisk('+ [ ] x external\n')
    h.session.externalChanged() // dirty + divergent disk: the merge is out
    await settled()

    expect(await h.session.commitTaskToggle(firstTask(source))).toBe(false)
  })

  it('reverts the toggle and surfaces the error when the write fails', async () => {
    const source = '+ [ ] x\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.failWrites('disk full')
    await expect(h.session.commitTaskToggle(firstTask(source))).rejects.toThrow('disk full')
    // Transactional: nothing persisted, so the buffer and the editor revert to
    // the un-toggled line (no divergence with the rolled-back Tasks list).
    expect(h.session.content()).toBe('+ [ ] x\n')
    expect(h.applied.at(-1)).toBe('+ [ ] x\n')
    expect(h.snapshots.at(-1)?.error).toBeNull()
  })

  it('propagates TaskStaleError when the task line is gone', async () => {
    const source = '+ [ ] gone\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] something else entirely\n')
    await expect(h.session.commitTaskToggle(firstTask(source))).rejects.toBeInstanceOf(TaskStaleError)
  })
})

describe('commitTaskEdit', () => {
  it('rewrites the content while preserving unsaved edits, reflected in the editor', async () => {
    const source = '# Todo\n\n+ [ ] buy milk\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.session.editorChanged('# Todo\n\n+ [ ] buy milk\n\njot\n') // unsaved when the edit arrives
    expect(await h.session.commitTaskEdit(firstTask(source), 'buy oat milk')).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('# Todo\n\n+ [ ] buy oat milk\n\njot\n')
    expect(h.applied.at(-1)).toBe('# Todo\n\n+ [ ] buy oat milk\n\njot\n')
  })

  it('keeps a checked marker when editing a completed task', async () => {
    const source = '+ [x] done\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskEdit(firstTask(source), 'really done')).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('+ [x] really done\n')
  })

  it('refuses (returns false) a protected note rather than write', async () => {
    const h = harness({ disk: '+ [ ] x\n', classify: () => 'lossy' })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskEdit(firstTask('+ [ ] x\n'), 'y')).toBe(false)
    expect(h.writes).toEqual([])
  })

  it('reverts and surfaces the error when the write fails', async () => {
    const source = '+ [ ] x\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.failWrites('disk full')
    await expect(h.session.commitTaskEdit(firstTask(source), 'y')).rejects.toThrow('disk full')
    expect(h.session.content()).toBe('+ [ ] x\n')
    expect(h.applied.at(-1)).toBe('+ [ ] x\n')
    expect(h.snapshots.at(-1)?.error).toBeNull()
  })

  it('propagates TaskStaleError when the task line is gone', async () => {
    const source = '+ [ ] gone\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] something else entirely\n')
    await expect(h.session.commitTaskEdit(firstTask(source), 'y')).rejects.toBeInstanceOf(
      TaskStaleError,
    )
  })
})

describe('commitTaskRemove', () => {
  it('removes the task line while preserving unsaved edits, reflected in the editor', async () => {
    const source = '+ [ ] buy milk\n+ [ ] call mum\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskRemove(firstTask(source))).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('+ [ ] call mum\n')
    expect(h.applied.at(-1)).toBe('+ [ ] call mum\n')
  })

  it('refuses (returns false) while an external change is being merged', async () => {
    const source = '+ [ ] x\n'
    const gate = gatedMerge()
    const h = harness({ disk: source, merge: gate.merge })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] x edited\n')
    h.setDisk('+ [ ] x external\n')
    h.session.externalChanged()
    await settled()

    expect(await h.session.commitTaskRemove(firstTask(source))).toBe(false)
  })

  it('reverts and surfaces the error when the write fails', async () => {
    const source = '+ [ ] x\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.failWrites('disk full')
    await expect(h.session.commitTaskRemove(firstTask(source))).rejects.toThrow('disk full')
    expect(h.session.content()).toBe('+ [ ] x\n')
    expect(h.applied.at(-1)).toBe('+ [ ] x\n')
  })
})

describe('commitTaskToBullet', () => {
  it('strips the marker to a plain bullet while preserving unsaved edits', async () => {
    const source = '+ [ ] buy milk\n+ [ ] call mum\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] buy milk\n+ [ ] call mum\n\njot\n') // unsaved when it arrives
    expect(await h.session.commitTaskToBullet(firstTask(source))).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('+ buy milk\n+ [ ] call mum\n\njot\n')
    expect(h.applied.at(-1)).toBe('+ buy milk\n+ [ ] call mum\n\njot\n')
  })

  it('drops a checked marker too', async () => {
    const source = '+ [x] done\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    expect(await h.session.commitTaskToBullet(firstTask(source))).toBe(true)
    expect(h.writes.at(-1)?.contents).toBe('+ done\n')
  })

  it('propagates TaskStaleError when the task line is gone', async () => {
    const source = '+ [ ] gone\n'
    const h = harness({ disk: source })
    h.session.load()
    await settled()

    h.session.editorChanged('+ [ ] something else entirely\n')
    await expect(h.session.commitTaskToBullet(firstTask(source))).rejects.toBeInstanceOf(
      TaskStaleError,
    )
  })
})
