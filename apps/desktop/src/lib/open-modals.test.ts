import { describe, expect, it } from 'vitest'
import { hasOpenModal, registerOpenModal } from './open-modals'

describe('open-modal registry', () => {
  it('stays open until every registered modal releases', () => {
    const first = registerOpenModal()
    const second = registerOpenModal()
    expect(hasOpenModal()).toBe(true)

    first()
    expect(hasOpenModal()).toBe(true) // the second modal still owns the window

    second()
    expect(hasOpenModal()).toBe(false)
  })

  it('treats a repeated release as a no-op', () => {
    const release = registerOpenModal()
    const other = registerOpenModal()
    release()
    release() // must not release the other modal's registration
    expect(hasOpenModal()).toBe(true)
    other()
    expect(hasOpenModal()).toBe(false)
  })
})
