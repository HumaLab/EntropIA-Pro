import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TranscriptionRepo } from './transcription.repo'
import type { DrizzleClient } from '../types'

// Helper: create a chainable mock that resolves with the given value
function createChainMock(resolveValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}

  const createProxy = (): unknown =>
    new Proxy(() => {}, {
      apply: () => (resolveValue instanceof Promise ? resolveValue : Promise.resolve(resolveValue)),
      get: (_target, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(resolveValue)
        }
        if (!chain[prop as string]) {
          chain[prop as string] = vi.fn().mockReturnValue(createProxy())
        }
        return chain[prop as string]
      },
    })

  return { proxy: createProxy(), chain }
}

function createMockDrizzle() {
  const selectMock = createChainMock([])
  const insertMock = createChainMock([])
  const updateMock = createChainMock([])
  const deleteMock = createChainMock([])

  const db = {
    select: vi.fn().mockReturnValue(selectMock.proxy),
    insert: vi.fn().mockReturnValue(insertMock.proxy),
    update: vi.fn().mockReturnValue(updateMock.proxy),
    delete: vi.fn().mockReturnValue(deleteMock.proxy),
  } as unknown as DrizzleClient

  return {
    db,
    mocks: {
      select: selectMock,
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
    },
  }
}

describe('TranscriptionRepo', () => {
  let db: ReturnType<typeof createMockDrizzle>
  let repo: TranscriptionRepo

  beforeEach(() => {
    db = createMockDrizzle()
    repo = new TranscriptionRepo(db.db)
  })

  describe('findByAsset', () => {
    it('returns null when no transcription exists', async () => {
      const selectResult = createChainMock([])
      ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

      const result = await repo.findByAsset('nonexistent-asset')
      expect(result).toBeNull()
    })

    it('returns the latest transcription for the asset', async () => {
      const transcription = {
        id: 'trans-latest',
        assetId: 'asset-1',
        textContent: 'Hablante 1: hola',
        language: 'es',
        durationMs: 1200,
        model: 'whisper-local',
        segments: null,
        confidence: 0.9,
        createdAt: 300,
      }

      const selectResult = createChainMock([transcription])
      ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

      const result = await repo.findByAsset('asset-1')
      expect(result).toEqual(transcription)
      expect(result!.textContent).toBe('Hablante 1: hola')
    })
  })

  describe('findTextByCollection', () => {
    it('returns empty array when the collection has no transcriptions', async () => {
      const selectResult = createChainMock([])
      ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

      const result = await repo.findTextByCollection('collection-1')
      expect(result).toEqual([])
      expect(db.db.select).toHaveBeenCalledTimes(1)
    })

    it('returns text rows for all assets in the collection', async () => {
      const rows = [
        { assetId: 'asset-1', textContent: 'Hablante 1: primera entrevista', createdAt: 100 },
        { assetId: 'asset-2', textContent: 'Hablante 2: segunda entrevista', createdAt: 200 },
      ]

      const selectResult = createChainMock(rows)
      ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

      const result = await repo.findTextByCollection('collection-1')
      expect(result).toEqual(rows)
      expect(result).toHaveLength(2)
      expect(result[1]!.assetId).toBe('asset-2')
    })
  })

  describe('parseSegments', () => {
    it('parses a valid segments JSON string', () => {
      const segments = [{ start_ms: 0, end_ms: 1000, text: 'hola' }]
      expect(TranscriptionRepo.parseSegments(JSON.stringify(segments))).toEqual(segments)
    })

    it('returns empty array for null or invalid JSON', () => {
      expect(TranscriptionRepo.parseSegments(null)).toEqual([])
      expect(TranscriptionRepo.parseSegments('{not json')).toEqual([])
    })
  })
})
