import { describe, expect, it } from 'vitest'

import { caretFloorOffset, caretRunwayScroll } from './caret-runway'

describe('caretFloorOffset', () => {
  it('reserves a share of a normal window', () => {
    expect(caretFloorOffset(1000)).toBe(280)
  })

  it('floors the reserve on a short viewport', () => {
    expect(caretFloorOffset(300)).toBe(96)
  })

  it('caps the reserve on a tall viewport', () => {
    expect(caretFloorOffset(2000)).toBe(320)
  })

  it('never reserves more than half the viewport', () => {
    expect(caretFloorOffset(150)).toBe(75)
  })
})

describe('caretRunwayScroll', () => {
  it('leaves a caret above the floor alone', () => {
    expect(
      caretRunwayScroll({ caretBottom: 300, viewportTop: 0, viewportHeight: 1000 }),
    ).toBe(0)
  })

  it('never scrolls back up for a caret high in the viewport', () => {
    expect(caretRunwayScroll({ caretBottom: 10, viewportTop: 0, viewportHeight: 1000 })).toBe(
      0,
    )
  })

  it('scrolls a caret that entered the floor band down to the floor', () => {
    // Floor sits 280px above the viewport bottom (720), so a caret at 760
    // scrolls 40px.
    expect(
      caretRunwayScroll({ caretBottom: 760, viewportTop: 0, viewportHeight: 1000 }),
    ).toBe(40)
  })

  it('measures the floor from the container, not the window', () => {
    // A pane offset 100px down the window: the floor is at 100 + 1000 - 280.
    expect(
      caretRunwayScroll({ caretBottom: 860, viewportTop: 100, viewportHeight: 1000 }),
    ).toBe(40)
  })

  it('lifts a caret pushed past the bottom edge back onto the floor', () => {
    expect(
      caretRunwayScroll({ caretBottom: 1020, viewportTop: 0, viewportHeight: 1000 }),
    ).toBe(300)
  })
})
