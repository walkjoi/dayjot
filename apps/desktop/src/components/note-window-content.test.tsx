import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteWindowContent } from './note-window-content'

const setWindowTitle = vi.hoisted(() => vi.fn())
const appLock = vi.hoisted(() => ({ phase: 'unlocked' }))

vi.mock('@/lib/windows/window-title', () => ({ setWindowTitle }))
vi.mock('@/providers/app-lock-provider', () => ({ useAppLock: () => appLock }))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { dateFormat: 'mdy' } }),
}))
vi.mock('@/routing/router', () => ({
  useRouter: () => ({ route: { kind: 'note', path: 'notes/diary.md' } }),
}))
vi.mock('@/hooks/use-note-row', () => ({
  useNoteRow: () => ({ title: 'Private diary' }),
}))
vi.mock('@/components/route-content', () => ({
  RouteContent: (): ReactElement => <div />,
}))
vi.mock('@/components/single-note-view', () => ({
  SingleNoteView: (): ReactElement => <div />,
}))

beforeEach(() => {
  appLock.phase = 'unlocked'
  setWindowTitle.mockClear()
})

afterEach(cleanup)

describe('NoteWindowContent', () => {
  it('titles the OS window after its note', () => {
    render(<NoteWindowContent />)
    expect(setWindowTitle).toHaveBeenLastCalledWith('Private diary')
  })

  it.each(['pending', 'locked'])('keeps the note out of the title while %s', (phase) => {
    appLock.phase = phase
    render(<NoteWindowContent />)
    expect(setWindowTitle).toHaveBeenLastCalledWith('DayJot')
  })
})
