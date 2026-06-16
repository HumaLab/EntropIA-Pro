import { describe, expect, it, vi } from 'vitest'
import { runPendingAssetJob, type PendingAssetJobState } from './item-view-media-jobs'

describe('runPendingAssetJob', () => {
  it('sets pending state, bumps tick, and executes the job', async () => {
    const calls: string[] = []
    const updateState = vi.fn((assetId: string, state: PendingAssetJobState) => {
      calls.push(`update:${assetId}:${state.status}:${state.progress ?? state.error ?? ''}`)
    })
    const bumpTick = vi.fn(() => calls.push('tick'))
    const execute = vi.fn(async () => calls.push('execute'))

    await runPendingAssetJob({
      assetId: 'asset-1',
      updateState,
      bumpTick,
      execute,
      fallbackError: 'Fallback failed',
    })

    expect(updateState).toHaveBeenCalledTimes(1)
    expect(updateState).toHaveBeenCalledWith('asset-1', { status: 'pending', progress: 0 })
    expect(bumpTick).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['update:asset-1:pending:0', 'tick', 'execute'])
  })

  it('uses Error messages for failed jobs', async () => {
    const updateState = vi.fn<(_: string, __: PendingAssetJobState) => void>()
    const bumpTick = vi.fn()

    await runPendingAssetJob({
      assetId: 'asset-1',
      updateState,
      bumpTick,
      execute: async () => {
        throw new Error('OCR exploded')
      },
      fallbackError: 'Extraction failed',
    })

    expect(updateState).toHaveBeenNthCalledWith(1, 'asset-1', { status: 'pending', progress: 0 })
    expect(updateState).toHaveBeenNthCalledWith(2, 'asset-1', {
      status: 'error',
      error: 'OCR exploded',
    })
    expect(bumpTick).toHaveBeenCalledTimes(2)
  })

  it('uses fallback messages for non-Error failed jobs', async () => {
    const updateState = vi.fn<(_: string, __: PendingAssetJobState) => void>()
    const bumpTick = vi.fn()

    await runPendingAssetJob({
      assetId: 'asset-1',
      updateState,
      bumpTick,
      execute: async () => {
        throw 'bad value'
      },
      fallbackError: 'Transcription failed',
    })

    expect(updateState).toHaveBeenNthCalledWith(1, 'asset-1', { status: 'pending', progress: 0 })
    expect(updateState).toHaveBeenNthCalledWith(2, 'asset-1', {
      status: 'error',
      error: 'Transcription failed',
    })
    expect(bumpTick).toHaveBeenCalledTimes(2)
  })
})
