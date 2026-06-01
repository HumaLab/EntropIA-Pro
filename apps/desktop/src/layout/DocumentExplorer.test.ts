import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { locale } from '$lib/i18n'
import DocumentExplorer from './DocumentExplorer.svelte'

const state = vi.hoisted(() => {
  const subscribers = new Set<(value: unknown) => void>()

  const snapshot = {
    history: [
      { name: 'collections' as const },
      { name: 'collection' as const, id: 'col-1', collectionName: 'Colección 1' },
      {
        name: 'item' as const,
        collectionId: 'col-1',
        collectionName: 'Colección 1',
        itemId: 'item-1',
        itemTitle: 'Acta 1',
      },
    ],
    current: {
      name: 'item' as const,
      collectionId: 'col-1',
      collectionName: 'Colección 1',
      itemId: 'item-1',
      itemTitle: 'Acta 1',
    },
    canGoBack: true,
    breadcrumb: ['Colecciones', 'Colección 1', 'Acta 1'],
  }

  const store = {
    collections: {
      findAll: vi.fn().mockResolvedValue([
        { id: 'col-1', name: 'Colección 1', description: null, createdAt: 1, updatedAt: 1 },
        { id: 'col-2', name: 'Colección 2', description: null, createdAt: 1, updatedAt: 1 },
      ]),
      countItems: vi.fn().mockImplementation(async (id: string) => (id === 'col-1' ? 2 : 1)),
    },
    items: {
      findByCollection: vi.fn().mockImplementation(async (collectionId: string) => {
        if (collectionId === 'col-2') {
          return [
            {
              id: 'item-3',
              title: 'Acta 3',
              collectionId: 'col-2',
              metadata: null,
              createdAt: 1,
              updatedAt: 3,
            },
          ]
        }

        return [
          {
            id: 'item-1',
            title: 'Acta 1',
            collectionId: 'col-1',
            metadata: null,
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: 'item-2',
            title: 'Acta 2',
            collectionId: 'col-1',
            metadata: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ]
      }),
    },
    assets: {
      findByItem: vi.fn().mockImplementation(async (itemId: string) => {
        if (itemId === 'item-2') {
          return [
            {
              id: 'asset-3',
              itemId: 'item-2',
              path: 'docs/foto-acta-2.png',
              type: 'image',
              size: 12,
              sortIndex: 0,
              createdAt: 1,
            },
          ]
        }

        if (itemId === 'item-3') {
          return [
            {
              id: 'asset-4',
              itemId: 'item-3',
              path: 'docs/acta-3.pdf',
              type: 'pdf',
              size: 14,
              sortIndex: 0,
              createdAt: 1,
            },
          ]
        }

        return [
          {
            id: 'asset-1',
            itemId: 'item-1',
            path: 'docs/acta-1.pdf',
            type: 'pdf',
            size: 10,
            sortIndex: 0,
            createdAt: 1,
          },
          {
            id: 'asset-2',
            itemId: 'item-1',
            path: 'docs/acta-1-audio.mp3',
            type: 'audio',
            size: 10,
            sortIndex: 1,
            createdAt: 1,
          },
        ]
      }),
    },
  }

  function emit() {
    const payload = {
      history: [...snapshot.history],
      current: { ...snapshot.current },
      canGoBack: snapshot.canGoBack,
      breadcrumb: [...snapshot.breadcrumb],
    }
    subscribers.forEach((run) => run(payload))
  }

  return {
    subscribers,
    snapshot,
    store,
    navigate: vi.fn(),
    replace: vi.fn(),
    resetToPath: vi.fn(),
    emit,
  }
})

vi.mock('$lib/navigation', () => ({
  navigation: {
    subscribe(run: (value: unknown) => void) {
      state.subscribers.add(run)
      state.emit()
      return () => state.subscribers.delete(run)
    },
    navigate: state.navigate,
    replace: state.replace,
    resetToPath: state.resetToPath,
  },
}))

vi.mock('$lib/db', () => ({
  getStore: () => state.store,
}))

describe('DocumentExplorer', () => {
  beforeEach(() => {
    locale.set('es')
    localStorage.clear()
    state.navigate.mockReset()
    state.replace.mockReset()
    state.resetToPath.mockReset()
    state.store.collections.findAll.mockClear()
    state.store.collections.countItems.mockClear()
    state.store.items.findByCollection.mockClear()
    state.store.assets.findByItem.mockClear()
  })

  it('expands collection nodes without navigating and lazy-loads documents', async () => {
    render(DocumentExplorer)

    const expandCollection = await screen.findByRole('button', {
      name: 'Expandir colección Colección 2',
    })

    await fireEvent.click(expandCollection)

    expect(state.navigate).not.toHaveBeenCalled()
    expect(state.replace).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(state.store.items.findByCollection).toHaveBeenCalledWith('col-2')
    })

    expect(await screen.findByRole('treeitem', { name: 'Acta 3' })).toBeInTheDocument()
  })

  it('renders active hierarchy and replaces sibling item navigation', async () => {
    render(DocumentExplorer)

    await screen.findByText('Colección 1')
    await screen.findByText('Acta 2')
    await screen.findByText('acta-1.pdf')

    await fireEvent.click(screen.getByRole('button', { name: 'Acta 2' }))

    expect(state.replace).toHaveBeenCalledWith({
      name: 'item',
      collectionId: 'col-1',
      collectionName: 'Colección 1',
      itemId: 'item-2',
      itemTitle: 'Acta 2',
    })
    expect(state.resetToPath).not.toHaveBeenCalled()
  })

  it('rebuilds canonical path when clicking a collection from another collection', async () => {
    render(DocumentExplorer)

    const collectionButton = (await screen.findByText('Colección 2')).closest('button')

    if (!collectionButton) {
      throw new Error('Expected collection button to be rendered')
    }

    await fireEvent.click(collectionButton)

    expect(state.resetToPath).toHaveBeenCalledWith([
      { name: 'collections' },
      { name: 'collection', id: 'col-2', collectionName: 'Colección 2' },
    ])
    expect(state.replace).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('rebuilds canonical path when clicking an item from another collection', async () => {
    render(DocumentExplorer)

    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Expandir colección Colección 2',
      })
    )

    const targetItem = await screen.findByRole('button', { name: 'Acta 3' })
    await fireEvent.click(targetItem)

    expect(state.resetToPath).toHaveBeenCalledWith([
      { name: 'collections' },
      { name: 'collection', id: 'col-2', collectionName: 'Colección 2' },
      {
        name: 'item',
        collectionId: 'col-2',
        collectionName: 'Colección 2',
        itemId: 'item-3',
        itemTitle: 'Acta 3',
      },
    ])
    expect(state.replace).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('expands document nodes without navigating and lazy-loads assets', async () => {
    render(DocumentExplorer)

    const expandItem = await screen.findByRole('button', {
      name: 'Expandir documento Acta 2',
    })

    await fireEvent.click(expandItem)

    expect(state.navigate).not.toHaveBeenCalled()
    expect(state.replace).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(state.store.assets.findByItem).toHaveBeenCalledWith('item-2')
    })

    expect(await screen.findByRole('treeitem', { name: 'foto-acta-2.png' })).toBeInTheDocument()
  })

  it('persists collapsed state', async () => {
    render(DocumentExplorer)

    const toggle = await screen.findByRole('button', {
      name: 'Cerrar explorador de documentos',
    })

    await fireEvent.click(toggle)

    expect(localStorage.getItem('entropia-document-explorer-open')).toBe('false')

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Abrir explorador de documentos' })
      ).toBeInTheDocument()
    })
  })

  it('persists expanded nodes and restores them while auto-expanding the active path', async () => {
    localStorage.setItem(
      'entropia-document-explorer-tree',
      JSON.stringify({
        collections: ['col-2'],
        items: ['item-3'],
      })
    )

    render(DocumentExplorer)

    expect(await screen.findByRole('treeitem', { name: 'Acta 1' })).toBeInTheDocument()
    expect(await screen.findByRole('treeitem', { name: 'acta-1.pdf' })).toBeInTheDocument()
    expect(await screen.findByRole('treeitem', { name: 'Acta 3' })).toBeInTheDocument()

    await waitFor(() => {
      expect(state.store.items.findByCollection).toHaveBeenCalledWith('col-2')
      expect(state.store.assets.findByItem).toHaveBeenCalledWith('item-3')
    })
  })

  it('renders inline svg icons for explorer controls and nodes', async () => {
    const { container } = render(DocumentExplorer)

    const railToggle = await screen.findByRole('button', {
      name: 'Cerrar explorador de documentos',
    })
    await screen.findByText('Colección 1')
    await screen.findByText('Acta 1')
    await screen.findByText('acta-1.pdf')
    await screen.findByText('acta-1-audio.mp3')

    const collectionButton = (await screen.findByText('Colección 1')).closest('button')
    const itemButton = (await screen.findByText('Acta 1')).closest('button')
    const pdfAssetButton = (await screen.findByText('acta-1.pdf')).closest('button')
    const audioAssetButton = (await screen.findByText('acta-1-audio.mp3')).closest('button')

    if (!collectionButton || !itemButton || !pdfAssetButton || !audioAssetButton) {
      throw new Error('Expected explorer node buttons to be rendered')
    }

    expect(railToggle.querySelector('svg')).not.toBeNull()
    expect(collectionButton.querySelector('svg')).not.toBeNull()
    expect(itemButton.querySelector('svg')).not.toBeNull()
    expect(pdfAssetButton.querySelector('svg')).not.toBeNull()
    expect(audioAssetButton.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(8)
  })

  it('renders inline svg icons for image assets after lazy expansion', async () => {
    render(DocumentExplorer)

    await screen.findByText('Acta 2')
    await fireEvent.click(await screen.findByRole('button', { name: 'Expandir documento Acta 2' }))

    const imageAssetButton = (await screen.findByText('foto-acta-2.png')).closest('button')

    if (!imageAssetButton) {
      throw new Error('Expected image asset button to be rendered')
    }

    expect(imageAssetButton.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('image')).toBeInTheDocument()
  })
})
