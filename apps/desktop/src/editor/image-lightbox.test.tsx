import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageLightbox, type LightboxImage } from './image-lightbox'

function makeImage(): LightboxImage {
  return {
    src: 'asset://cat.png',
    alt: 'Cat',
    openPath: 'assets/cat.png',
    openImage: vi.fn(async () => {}),
    transitionName: 'dayjot-image-lightbox-1',
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ImageLightbox', () => {
  it('renders the preview on the dialog scrim and closes on click', () => {
    const onClose = vi.fn()
    render(<ImageLightbox image={makeImage()} onClose={onClose} onOpenImage={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Image preview' })
    expect(dialog.querySelector('.bg-black')).toBeNull()
    expect(dialog.className).toContain('bg-black/80')

    const preview = screen.getByRole('button', { name: 'Close image preview' })
    const image = preview.querySelector('img')
    expect(image?.className).toContain('max-h-full max-w-full')

    fireEvent.click(preview)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
