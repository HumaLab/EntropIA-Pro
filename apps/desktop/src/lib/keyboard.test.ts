import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupKeyboardShortcuts, registerEscapeInterceptor } from './keyboard'

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

describe('registerEscapeInterceptor', () => {
  let cleanup: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    cleanup = setupKeyboardShortcuts()
  })

  afterEach(() => {
    cleanup()
  })

  function pressEscape() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  }

  it('skips back-navigation when an interceptor consumes Escape', async () => {
    const { navigation } = await import('./navigation')
    const interceptor = vi.fn().mockReturnValue(true)
    const unregister = registerEscapeInterceptor(interceptor)

    pressEscape()

    expect(interceptor).toHaveBeenCalledOnce()
    expect(navigation.back).not.toHaveBeenCalled()
    unregister()
  })

  it('falls through to back-navigation when no interceptor consumes Escape', async () => {
    const { navigation } = await import('./navigation')
    const interceptor = vi.fn().mockReturnValue(false)
    const unregister = registerEscapeInterceptor(interceptor)

    pressEscape()

    expect(interceptor).toHaveBeenCalledOnce()
    expect(navigation.back).toHaveBeenCalledOnce()
    unregister()
  })

  it('runs interceptors most-recently-registered first and stops at the first consumer', async () => {
    const { navigation } = await import('./navigation')
    const calls: string[] = []
    const unregisterFirst = registerEscapeInterceptor(() => {
      calls.push('first')
      return true
    })
    const unregisterSecond = registerEscapeInterceptor(() => {
      calls.push('second')
      return true
    })

    pressEscape()

    expect(calls).toEqual(['second'])
    expect(navigation.back).not.toHaveBeenCalled()
    unregisterFirst()
    unregisterSecond()
  })

  it('restores back-navigation after an interceptor unregisters', async () => {
    const { navigation } = await import('./navigation')
    const unregister = registerEscapeInterceptor(() => true)

    unregister()
    pressEscape()

    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('does not run interceptors when the Escape is ignored (e.g. typed in an input)', async () => {
    const { navigation } = await import('./navigation')
    const interceptor = vi.fn().mockReturnValue(true)
    const unregister = registerEscapeInterceptor(interceptor)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(interceptor).not.toHaveBeenCalled()
    expect(navigation.back).not.toHaveBeenCalled()
    input.remove()
    unregister()
  })
})
