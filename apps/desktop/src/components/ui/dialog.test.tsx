import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { hasOpenModal } from '@/lib/open-modals'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog'

/**
 * The shared wrapper is how every dialog joins the open-modal registry the
 * app-shortcut gate reads — controlled or trigger-driven alike.
 */

afterEach(() => {
  cleanup()
})

function ControlledDialog(): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open controlled
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Controlled</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UncontrolledDialog({ modal }: { modal?: boolean }): ReactElement {
  return (
    <Dialog {...(modal === undefined ? {} : { modal })}>
      <DialogTrigger>Open uncontrolled</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Uncontrolled</DialogTitle>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('registers a controlled dialog only while it is open', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog />)
    expect(hasOpenModal()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Open controlled' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasOpenModal()).toBe(true)

    await user.keyboard('{Escape}')
    expect(hasOpenModal()).toBe(false)
  })

  it('registers a trigger-driven dialog it does not control', async () => {
    const user = userEvent.setup()
    render(<UncontrolledDialog />)
    expect(hasOpenModal()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Open uncontrolled' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasOpenModal()).toBe(true)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hasOpenModal()).toBe(false)
  })

  it('leaves a non-modal dialog out', async () => {
    const user = userEvent.setup()
    render(<UncontrolledDialog modal={false} />)

    await user.click(screen.getByRole('button', { name: 'Open uncontrolled' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasOpenModal()).toBe(false)
  })

  it('releases its registration when unmounted while open', () => {
    const { unmount } = render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Open</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(hasOpenModal()).toBe(true)

    act(() => unmount())
    expect(hasOpenModal()).toBe(false)
  })
})
