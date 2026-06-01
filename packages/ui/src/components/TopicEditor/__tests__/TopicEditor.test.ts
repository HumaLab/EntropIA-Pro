import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import TopicEditor from '../TopicEditor.svelte'

describe('TopicEditor', () => {
  it('renders remove-topic controls with accessible names and no textual multiplication sign', () => {
    render(TopicEditor, {
      props: {
        topics: ['ARCHIVE'],
      },
    })

    const removeButton = screen.getByRole('button', { name: 'Quitar tópico ARCHIVE' })
    expect(removeButton).toBeInTheDocument()
    expect(removeButton).not.toHaveTextContent('×')
  })

  it('removes a topic when its icon button is clicked', async () => {
    const onchange = vi.fn()
    render(TopicEditor, {
      props: {
        topics: ['ARCHIVE', 'LETTER'],
        onchange,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Quitar tópico ARCHIVE' }))

    expect(onchange).toHaveBeenCalledWith(['LETTER'])
  })

  it('renders Spanish placeholders for empty and populated topic input', async () => {
    const { rerender } = render(TopicEditor, {
      props: {
        topics: [],
      },
    })

    expect(screen.getByPlaceholderText('Escribí un tópico...')).toBeInTheDocument()

    await rerender({ topics: ['ARCHIVE'] })

    expect(screen.getByPlaceholderText('Agregar más...')).toBeInTheDocument()
  })
})
