import { describe, expect, it, vi } from 'vitest'
import {
  getActiveLlmTarget,
  getErrorMessage,
  isLlmCorrectOcrJob,
  isLlmSummaryJob,
  isLlmTriplesJob,
  runScopedLlmAction,
  selectOcrCorrectionAssetId,
} from './item-view-llm-orchestration'

describe('item view LLM orchestration helpers', () => {
  it('uses the selected asset as active LLM target when available', () => {
    expect(getActiveLlmTarget({ itemId: 'item-1', selectedAssetId: 'asset-1' })).toEqual({
      scope: 'asset',
      targetId: 'asset-1',
    })
  })

  it('falls back to item scope when there is no selected asset', () => {
    expect(getActiveLlmTarget({ itemId: 'item-1', selectedAssetId: null })).toEqual({
      scope: 'item',
      targetId: 'item-1',
    })
  })

  it('runs asset-scoped LLM actions when an asset is selected', async () => {
    const runAsset = vi.fn().mockResolvedValue(undefined)
    const runItem = vi.fn().mockResolvedValue(undefined)

    await runScopedLlmAction({
      itemId: 'item-1',
      selectedAssetId: 'asset-1',
      runAsset,
      runItem,
    })

    expect(runAsset).toHaveBeenCalledWith('asset-1')
    expect(runItem).not.toHaveBeenCalled()
  })

  it('runs item-scoped LLM actions when no asset is selected', async () => {
    const runAsset = vi.fn().mockResolvedValue(undefined)
    const runItem = vi.fn().mockResolvedValue(undefined)

    await runScopedLlmAction({
      itemId: 'item-1',
      selectedAssetId: null,
      runAsset,
      runItem,
    })

    expect(runItem).toHaveBeenCalledWith('item-1')
    expect(runAsset).not.toHaveBeenCalled()
  })

  it('classifies LLM job types used by ItemView orchestration', () => {
    expect(isLlmSummaryJob('summarize')).toBe(true)
    expect(isLlmCorrectOcrJob('correct_ocr')).toBe(true)
    expect(isLlmTriplesJob('extract_triples')).toBe(true)
    expect(isLlmTriplesJob('summarize')).toBe(false)
  })

  it('selects the current asset for OCR correction when the completed target matches it', () => {
    expect(
      selectOcrCorrectionAssetId({
        completedTargetId: 'asset-2',
        selectedAssetId: 'asset-2',
        assets: [{ id: 'asset-1' }, { id: 'asset-2' }],
      })
    ).toBe('asset-2')
  })

  it('selects the completed asset target even if the user changed assets before completion', () => {
    expect(
      selectOcrCorrectionAssetId({
        completedTargetId: 'asset-2',
        selectedAssetId: 'asset-3',
        assets: [{ id: 'asset-1' }, { id: 'asset-2' }, { id: 'asset-3' }],
      })
    ).toBe('asset-2')
  })

  it('does not fall back to another asset for item-level correction', () => {
    expect(
      selectOcrCorrectionAssetId({
        completedTargetId: 'item-1',
        selectedAssetId: null,
        assets: [{ id: 'asset-1' }, { id: 'asset-2' }],
      })
    ).toBeNull()
  })

  it('returns null when no OCR correction target can be resolved', () => {
    expect(
      selectOcrCorrectionAssetId({
        completedTargetId: 'item-1',
        selectedAssetId: null,
        assets: [{ id: 'asset-1' }],
      })
    ).toBeNull()
  })

  it('normalizes unknown errors to a fallback message', () => {
    expect(getErrorMessage(new Error('Boom'))).toBe('Boom')
    expect(getErrorMessage('bad value', 'Fallback')).toBe('Fallback')
  })
})
