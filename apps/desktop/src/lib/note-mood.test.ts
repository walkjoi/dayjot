import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string>())
vi.mock('@/editor/open-documents', () => ({ openSession: () => null }))
vi.mock('@/lib/note-read', () => ({
  readNoteOrEmpty: async (path: string) => files.get(path) ?? '',
}))
vi.mock('@dayjot/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayjot/core')>()),
  writeNote: async (path: string, contents: string) => {
    files.set(path, contents)
  },
}))

const { rateDailyNote } = await import('./note-mood')

const PATH = 'daily/2026-10-26.md'

beforeEach(() => {
  files.clear()
})

describe('rateDailyNote', () => {
  it('keeps the rating in frontmatter, leaving the note text untouched', async () => {
    files.set(PATH, '- walked to work\n')
    await rateDailyNote(PATH, 4, 1)
    expect(files.get(PATH)).toBe('---\nmood: 4\n---\n- walked to work\n')
  })

  it('rewrites the rating beside other keys and clears it without leaving a husk', async () => {
    files.set(PATH, '---\nprivate: true\nmood: 2\n---\n- walked\n')
    await rateDailyNote(PATH, 5, 1)
    expect(files.get(PATH)).toBe('---\nprivate: true\nmood: 5\n---\n- walked\n')

    files.set(PATH, '---\nmood: 5\n---\n- walked\n')
    await rateDailyNote(PATH, null, 1)
    expect(files.get(PATH)).toBe('- walked\n')
  })

  it('creates a not-yet-written daily note holding just the rating', async () => {
    await rateDailyNote(PATH, 3, 1)
    expect(files.get(PATH)).toBe('---\nmood: 3\n---\n')
  })
})
