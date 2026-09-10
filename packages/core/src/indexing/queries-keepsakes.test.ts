import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { getKeepsakes, keepsakeDate } from './queries-keepsakes'

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

beforeEach(() => {
  mockInvoke.mockReset()
  setBridge({ invoke: mockInvoke, listen: async () => () => {} })
})

afterEach(() => {
  setBridge(null)
})

/** Answer `db_query` with `rows` and `note_read` from `notes`. */
function bridge(rows: Record<string, unknown>[], notes: Record<string, string>): void {
  mockInvoke.mockImplementation(async (command, args) => {
    if (command === 'db_query') {
      return rows
    }
    if (command === 'note_read') {
      const path = String(args['path'])
      const source = notes[path]
      if (source === undefined) {
        throw new Error(`no such note: ${path}`)
      }
      return source
    }
    throw new Error(`unexpected command: ${command}`)
  })
}

function noteRow(path: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path,
    title: path,
    daily_date: null,
    updated_at: Date.UTC(2026, 8, 9),
    ...overrides,
  }
}

describe('getKeepsakes', () => {
  it('asks the tags index for the reserved marker, skipping templates', async () => {
    bridge([], {})

    await getKeepsakes()

    const [command, args] = mockInvoke.mock.calls[0]!
    expect(command).toBe('db_query')
    const sql = String(args['sql'])
    expect(sql).toContain('tag_key')
    expect(sql).toContain('kind')
    expect(args['params']).toEqual(['keep', 'template'])
  })

  it('returns the kept lines of each marked note with its note context', async () => {
    bridge([noteRow('daily/2026-09-09.md', { title: '2026-09-09', daily_date: '2026-09-09' })], {
      'daily/2026-09-09.md': '- 09:14 standup\n- 10:02 妈妈说的那句话 #keep\n',
    })

    const keepsakes = await getKeepsakes()

    expect(keepsakes).toHaveLength(1)
    expect(keepsakes[0]).toMatchObject({
      notePath: 'daily/2026-09-09.md',
      noteTitle: '2026-09-09',
      dailyDate: '2026-09-09',
      text: '10:02 妈妈说的那句话',
      links: [],
    })
  })

  it('orders newest day first, and document order within a note', async () => {
    bridge(
      [
        noteRow('daily/2026-08-11.md', { daily_date: '2026-08-11' }),
        noteRow('daily/2026-09-09.md', { daily_date: '2026-09-09' }),
      ],
      {
        'daily/2026-08-11.md': '- older #keep\n',
        'daily/2026-09-09.md': '- first #keep\n- second #keep\n',
      },
    )

    const keepsakes = await getKeepsakes()

    expect(keepsakes.map((keepsake) => keepsake.text)).toEqual(['first', 'second', 'older'])
  })

  it('dates a keepsake outside a daily note by the note mtime', async () => {
    bridge([noteRow('notes/wine.md', { title: 'Wine', updated_at: Date.UTC(2026, 5, 18, 12) })], {
      'notes/wine.md': '- Ridge Lytton Springs — the 2019 #keep\n',
    })

    const [keepsake] = await getKeepsakes()

    expect(keepsake?.dailyDate).toBeNull()
    expect(keepsakeDate(keepsake!)).toBe('2026-06-18')
  })

  it('skips a note the index still lists but the disk no longer holds', async () => {
    bridge([noteRow('daily/2026-09-09.md', { daily_date: '2026-09-09' }), noteRow('gone.md')], {
      'daily/2026-09-09.md': '- kept #keep\n',
    })

    const keepsakes = await getKeepsakes()

    expect(keepsakes.map((keepsake) => keepsake.text)).toEqual(['kept'])
  })

  it('carries the wiki links written on the kept line', async () => {
    bridge([noteRow('daily/2026-09-09.md', { daily_date: '2026-09-09' })], {
      'daily/2026-09-09.md': '- 那瓶 Sancerre 是 Domaine Vacheron — [[Wine]] #keep\n',
    })

    const [keepsake] = await getKeepsakes()

    expect(keepsake?.links).toEqual(['Wine'])
  })
})
