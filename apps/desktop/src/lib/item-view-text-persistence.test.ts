import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebouncedAssetTextPersistor } from './item-view-text-persistence'

describe('DebouncedAssetTextPersistor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists the latest scheduled text after the debounce delay', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const afterPersist = vi.fn()
    const persistor = new DebouncedAssetTextPersistor({ delayMs: 500, persist, afterPersist })

    persistor.schedule('asset-1', 'old text')
    persistor.schedule('asset-1', 'new text')

    await vi.advanceTimersByTimeAsync(499)
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('asset-1', 'new text')
    expect(afterPersist).toHaveBeenCalledWith('asset-1', 'new text')
  })

  it('does not call afterPersist when persistence fails', async () => {
    const error = new Error('persist failed')
    const persist = vi.fn().mockRejectedValue(error)
    const afterPersist = vi.fn()
    const onError = vi.fn()
    const persistor = new DebouncedAssetTextPersistor({
      delayMs: 500,
      persist,
      afterPersist,
      onError,
    })

    persistor.schedule('asset-1', 'text')
    await vi.advanceTimersByTimeAsync(500)

    expect(afterPersist).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('cancels all pending text persistence timers', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const persistor = new DebouncedAssetTextPersistor({ delayMs: 500, persist })

    persistor.schedule('asset-1', 'text')
    persistor.schedule('asset-2', 'other')
    persistor.cancelAll()
    await vi.advanceTimersByTimeAsync(500)

    expect(persist).not.toHaveBeenCalled()
  })
})
