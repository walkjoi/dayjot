import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNoteSource = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>())
const markPeriodDay = vi.hoisted(() =>
  vi.fn<(path: string, isPeriodDay: boolean, generation: number) => Promise<void>>(),
)
const failOperation = vi.hoisted(() => vi.fn<(message: string) => void>())
vi.mock('@/lib/note-frontmatter', () => ({ readNoteSource }))
vi.mock('@/lib/note-period', () => ({ markPeriodDay }))
vi.mock('@/lib/operations', () => ({ startOperation: () => ({ fail: failOperation }) }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 3 } }),
}))

const { usePeriodSlashItems } = await import('./use-period-slash-items')

const DAY = 'daily/2026-10-26.md'

beforeEach(() => {
  readNoteSource.mockReset().mockResolvedValue('- walked\n')
  markPeriodDay.mockReset().mockResolvedValue(undefined)
  failOperation.mockReset()
})

describe('usePeriodSlashItems', () => {
  it('offers to mark an unmarked day, and marks it without typing anything', async () => {
    const { result } = renderHook(() => usePeriodSlashItems(DAY))
    const items = await result.current('per')
    expect(items.map((item) => item.label)).toEqual(['Mark period day'])
    items[0]!.onSelect()
    expect(markPeriodDay).toHaveBeenCalledWith(DAY, true, 3)
  })

  it('offers to unmark a day already marked', async () => {
    readNoteSource.mockResolvedValue('---\nperiod: true\n---\n- cramps\n')
    const { result } = renderHook(() => usePeriodSlashItems(DAY))
    const items = await result.current('period')
    expect(items.map((item) => item.label)).toEqual(['Unmark period day'])
    items[0]!.onSelect()
    expect(markPeriodDay).toHaveBeenCalledWith(DAY, false, 3)
  })

  it('stays out of the browse list, other commands, and non-daily notes', async () => {
    const { result } = renderHook(() => usePeriodSlashItems(DAY))
    expect(await result.current('')).toEqual([])
    expect(await result.current('pin')).toEqual([])
    const { result: regular } = renderHook(() => usePeriodSlashItems(null))
    expect(await regular.current('period')).toEqual([])
  })

  it('says why when the flag could not be saved', async () => {
    markPeriodDay.mockRejectedValue(new Error('note busy'))
    const { result } = renderHook(() => usePeriodSlashItems(DAY))
    ;(await result.current('p'))[0]!.onSelect()
    await waitFor(() => expect(failOperation).toHaveBeenCalledWith('note busy'))
  })
})
