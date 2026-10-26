import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateDailyNote = vi.hoisted(() =>
  vi.fn<(path: string, rating: number | null, generation: number) => Promise<void>>(),
)
const failOperation = vi.hoisted(() => vi.fn<(message: string) => void>())
vi.mock('@/lib/note-mood', () => ({ rateDailyNote }))
vi.mock('@/lib/operations', () => ({ startOperation: () => ({ fail: failOperation }) }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 3 } }),
}))

const { useMoodSlashItems } = await import('./use-mood-slash-items')

const DAY = 'daily/2026-10-26.md'

beforeEach(() => {
  rateDailyNote.mockReset().mockResolvedValue(undefined)
  failOperation.mockReset()
})

describe('useMoodSlashItems', () => {
  it('offers the five ratings, Awful through Great, once the query spells mood', async () => {
    const { result } = renderHook(() => useMoodSlashItems(DAY))

    const items = await result.current('mood')
    expect(items.map((item) => item.label)).toEqual([
      'Mood: Awful',
      'Mood: Bad',
      'Mood: Okay',
      'Mood: Good',
      'Mood: Great',
    ])
    expect(await result.current('Mo')).toHaveLength(5)
  })

  it('stays out of the browse list, other commands, and non-daily notes', async () => {
    const { result } = renderHook(() => useMoodSlashItems(DAY))
    expect(await result.current('')).toEqual([])
    expect(await result.current('m')).toEqual([])
    expect(await result.current('math')).toEqual([])

    const { result: regular } = renderHook(() => useMoodSlashItems(null))
    expect(await regular.current('mood')).toEqual([])
  })

  it("sets the day's rating instead of typing anything", async () => {
    const { result } = renderHook(() => useMoodSlashItems(DAY))
    ;(await result.current('mood'))[3]!.onSelect()
    expect(rateDailyNote).toHaveBeenCalledWith(DAY, 4, 3)
  })

  it('says why when the rating could not be saved', async () => {
    rateDailyNote.mockRejectedValue(new Error('note busy'))
    const { result } = renderHook(() => useMoodSlashItems(DAY))
    ;(await result.current('mood'))[0]!.onSelect()
    await waitFor(() => expect(failOperation).toHaveBeenCalledWith('note busy'))
  })
})
