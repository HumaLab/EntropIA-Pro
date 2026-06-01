import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TopBar from './TopBar.svelte'
import { locale } from '$lib/i18n'
import type { View } from '$lib/navigation'

type NavigationSnapshot = {
  history: View[]
  current: View
  canGoBack: boolean
  breadcrumb: string[]
}

const {
  navigationStore,
  setNavigationState,
  navigateMock,
  replaceMock,
  openRootSectionMock,
  backMock,
  storeRef,
} = vi.hoisted(() => {
  let current: NavigationSnapshot = {
    history: [{ name: 'collections' as const }],
    current: { name: 'collections' as const },
    canGoBack: false,
    breadcrumb: ['Collections'],
  }
  const subscribers = new Set<(value: NavigationSnapshot) => void>()

  return {
    navigationStore: {
      subscribe(run: (value: NavigationSnapshot) => void) {
        subscribers.add(run)
        run(current)
        return () => subscribers.delete(run)
      },
    },
    setNavigationState(value: typeof current) {
      current = value
      subscribers.forEach((run) => run(current))
    },
    navigateMock: vi.fn(),
    replaceMock: vi.fn(),
    openRootSectionMock: vi.fn(),
    backMock: vi.fn(),
    storeRef: {
      current: {
        items: { searchGlobal: vi.fn(), findByCollection: vi.fn() },
        collections: { findById: vi.fn() },
      },
    },
  }
})

vi.mock('$lib/navigation', () => ({
  navigation: {
    subscribe: navigationStore.subscribe,
    navigate: navigateMock,
    replace: replaceMock,
    openRootSection: openRootSectionMock,
    back: backMock,
  },
}))

vi.mock('$lib/db', () => ({
  getStore: () => storeRef.current,
}))

describe('TopBar', () => {
  beforeEach(() => {
    locale.set('es')
    localStorage.clear()
    delete document.documentElement.dataset.theme
    vi.useFakeTimers()
    navigateMock.mockReset()
    replaceMock.mockReset()
    openRootSectionMock.mockReset()
    backMock.mockReset()
    storeRef.current.items.searchGlobal.mockReset()
    storeRef.current.items.findByCollection.mockReset()
    storeRef.current.collections.findById.mockReset()
    storeRef.current.items.findByCollection.mockResolvedValue([
      { id: 'item-0', title: 'Acta 0', collectionId: 'col-1' },
      { id: 'item-1', title: 'Acta 1', collectionId: 'col-1' },
      { id: 'item-2', title: 'Acta 2', collectionId: 'col-1' },
    ])
    setNavigationState({
      history: [
        { name: 'collections' },
        { name: 'collection', id: 'col-1', collectionName: 'Archivo' },
      ],
      current: { name: 'collection', id: 'col-1', collectionName: 'Archivo' },
      canGoBack: true,
      breadcrumb: ['Collections', 'Archivo'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('renders accessible controls for navigation and global search', () => {
    render(TopBar)

    expect(
      screen.getByRole('button', { name: 'Abrir navegador de base de datos' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Oscuro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir configuración' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar archivos' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Documento anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Documento siguiente' })).not.toBeInTheDocument()
  })

  it('navigates to db browser from the database icon button', async () => {
    render(TopBar)

    await fireEvent.click(screen.getByRole('button', { name: 'Abrir navegador de base de datos' }))

    expect(openRootSectionMock).toHaveBeenCalledWith({ name: 'db-browser' })
  })

  it('opens settings as a canonical root section', async () => {
    render(TopBar)

    await fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))

    expect(openRootSectionMock).toHaveBeenCalledWith({ name: 'settings' })
  })


  it('toggles and persists the less dark theme from the topbar', async () => {
    render(TopBar)

    await fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))

    expect(document.documentElement.dataset.theme).toBe('dim')
    expect(localStorage.getItem('entropia-theme')).toBe('dim')
    expect(screen.getByRole('button', { name: 'Cálido' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('updates translated top bar labels when locale changes', async () => {
    render(TopBar)

    locale.set('en')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: 'Search files' })).toBeInTheDocument()
    })
  })

  it('uses an icon-only clear button for global search', async () => {
    render(TopBar)

    const input = screen.getByRole('searchbox', { name: 'Buscar archivos' })
    await fireEvent.input(input, { target: { value: 'acta' } })

    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).not.toHaveTextContent('×')
  })

  it('shows results and navigates to the selected item', async () => {
    storeRef.current.items.searchGlobal.mockResolvedValueOnce([
      { id: 'item-1', title: 'Acta fundacional', collectionId: 'col-1' },
    ])
    storeRef.current.collections.findById.mockResolvedValueOnce({
      id: 'col-1',
      name: 'Archivo',
    })

    render(TopBar)

    const input = screen.getByRole('searchbox', { name: 'Buscar archivos' })
    await fireEvent.input(input, { target: { value: 'acta' } })
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Acta fundacional/i })).toBeInTheDocument()
    })

    await fireEvent.click(screen.getByRole('button', { name: /Acta fundacional/i }))

    expect(navigateMock).toHaveBeenNthCalledWith(1, {
      name: 'collection',
      id: 'col-1',
      collectionName: 'Archivo',
    })
    expect(navigateMock).toHaveBeenNthCalledWith(2, {
      name: 'item',
      collectionId: 'col-1',
      collectionName: 'Archivo',
      itemId: 'item-1',
      itemTitle: 'Acta fundacional',
    })
  })

  it('renders sibling document controls and replaces navigation within the same collection', async () => {
    setNavigationState({
      history: [
        { name: 'collections' },
        { name: 'collection', id: 'col-1', collectionName: 'Archivo' },
        {
          name: 'item',
          collectionId: 'col-1',
          collectionName: 'Archivo',
          itemId: 'item-1',
          itemTitle: 'Acta 1',
        },
      ],
      current: {
        name: 'item',
        collectionId: 'col-1',
        collectionName: 'Archivo',
        itemId: 'item-1',
        itemTitle: 'Acta 1',
      },
      canGoBack: true,
      breadcrumb: ['Collections', 'Archivo', 'Acta 1'],
    })

    render(TopBar)

    const previousButton = await screen.findByRole('button', { name: 'Documento anterior' })
    const nextButton = await screen.findByRole('button', { name: 'Documento siguiente' })

    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeEnabled()

    await fireEvent.click(nextButton)

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'item',
      collectionId: 'col-1',
      collectionName: 'Archivo',
      itemId: 'item-2',
      itemTitle: 'Acta 2',
    })
  })

  it('disables sibling controls at collection boundaries', async () => {
    storeRef.current.items.findByCollection.mockResolvedValueOnce([
      { id: 'item-1', title: 'Acta 1', collectionId: 'col-1' },
      { id: 'item-2', title: 'Acta 2', collectionId: 'col-1' },
    ])
    setNavigationState({
      history: [
        { name: 'collections' },
        { name: 'collection', id: 'col-1', collectionName: 'Archivo' },
        {
          name: 'item',
          collectionId: 'col-1',
          collectionName: 'Archivo',
          itemId: 'item-1',
          itemTitle: 'Acta 1',
        },
      ],
      current: {
        name: 'item',
        collectionId: 'col-1',
        collectionName: 'Archivo',
        itemId: 'item-1',
        itemTitle: 'Acta 1',
      },
      canGoBack: true,
      breadcrumb: ['Collections', 'Archivo', 'Acta 1'],
    })

    render(TopBar)

    expect(await screen.findByRole('button', { name: 'Documento anterior' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Documento siguiente' })).toBeEnabled()
  })
})
