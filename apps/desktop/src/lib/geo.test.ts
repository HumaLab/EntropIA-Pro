import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeoStore } from './geo'

// Mocks are set up in test-setup.ts:
//   @tauri-apps/api/event → listen vi.fn() returning Promise<vi.fn()>

const { listen } = await import('@tauri-apps/api/event')

describe('GeoStore listener lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stopListening calls all unlisten functions registered by startListening', async () => {
    const cleanup = vi.fn()
    vi.mocked(listen).mockImplementation(() => Promise.resolve(cleanup))

    const store = new GeoStore()
    await store.startListening()
    store.stopListening()

    expect(cleanup).toHaveBeenCalledTimes(3) // entity-complete, item-complete, error
  })

  it('stopListening is safe to call without startListening', () => {
    const store = new GeoStore()
    expect(() => store.stopListening()).not.toThrow()
  })

  it('stopListening before startListening resolves unlistens late registrations', async () => {
    const cleanup = vi.fn()
    let resolveFirstListen: ((unlisten: () => void) => void) | null = null

    let callCount = 0
    vi.mocked(listen).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirstListen = resolve
        })
      }
      return Promise.resolve(cleanup)
    })

    const store = new GeoStore()
    const startPromise = store.startListening()

    // Unmount happens while the listen() registrations are still in flight
    store.stopListening()

    resolveFirstListen!(cleanup)
    await startPromise

    // All late registrations must be unlistened immediately, not leaked
    expect(cleanup).toHaveBeenCalledTimes(3)
  })
})
