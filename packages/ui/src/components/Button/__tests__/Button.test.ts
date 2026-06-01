import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import ButtonTestHost from './ButtonTestHost.svelte'

describe('Button', () => {
  it('renders icon-only buttons with an accessible name', () => {
    render(ButtonTestHost, {
      props: {
        iconOnly: true,
        label: 'Edit collection',
      },
    })

    const button = screen.getByRole('button', { name: 'Edit collection' })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('btn--icon-only')
  })

  it('keeps icon-only controls square across sizes', () => {
    render(ButtonTestHost, {
      props: {
        iconOnly: true,
        size: 'sm',
        label: 'Delete collection',
      },
    })

    expect(screen.getByRole('button', { name: 'Delete collection' }).className).toContain('btn--sm')
  })
})
