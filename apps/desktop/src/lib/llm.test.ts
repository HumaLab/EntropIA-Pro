import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmStore, llmGetResult, llmGetResults } from './llm'

const { invoke } = await import('@tauri-apps/api/core')

describe('llm client target scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llmGetResults sends targetType for asset-scoped hydration', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])

    await llmGetResults('asset-1', 'asset')

    expect(invoke).toHaveBeenCalledWith('llm_get_results', {
      targetId: 'asset-1',
      targetType: 'asset',
    })
  })

  it('llmGetResult sends targetType for item-scoped lookups', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)

    await llmGetResult('item-1', 'summarize', 'item')

    expect(invoke).toHaveBeenCalledWith('llm_get_result', {
      targetId: 'item-1',
      jobType: 'summarize',
      targetType: 'item',
    })
  })

  it('loadPersistedResults hydrates only results for the requested target scope', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      {
        target_id: 'shared-id',
        target_type: 'asset',
        job_type: 'summarize',
        result: 'asset summary',
        created_at: 1710000000000,
      },
    ])

    const store = new LlmStore()

    await store.loadPersistedResults('shared-id', 'asset')

    expect(invoke).toHaveBeenCalledWith('llm_get_results', {
      targetId: 'shared-id',
      targetType: 'asset',
    })
    expect(store.getState('shared-id').result).toBe('asset summary')
  })
})
