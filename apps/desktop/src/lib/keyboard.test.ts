import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupKeyboardShortcuts } from './keyboard'

// We mock the navigation module so we can spy on .back()
vi.mock('./navigation', () => {
  const store = {
    back: vi.fn(),
    current: { name: 'collections' as const },
    canGoBack: false,
    breadcrumb: ['Collections'],
    navigate: vi.fn(),
  }
  return {
    navigation: store,
    NavigationStore: vi.fn(),
  }
})

describe('setupKeyboardShortcuts', () => {
  let cleanup: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    cleanup = setupKeyboardShortcuts()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls navigation.back() on Escape key', async () => {
    const { navigation } = await import('./navigation')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('does not call back on other keys', async () => {
    const { navigation } = await import('./navigation')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(navigation.back).not.toHaveBeenCalled()
  })

  it('removes listener on cleanup', async () => {
    const { navigation } = await import('./navigation')
    cleanup()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(navigation.back).not.toHaveBeenCalled()
  })
})
