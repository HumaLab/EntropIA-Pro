import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the client module before imports
vi.mock('../client', () => ({
  createDrizzleClient: vi.fn(),
}))

vi.mock('../runner', () => ({
  runMigrations: vi.fn(),
}))

import { initStore } from './store'
import type { StoreApi } from './store'
import { createDrizzleClient } from '../client'
import { runMigrations } from '../runner'
import { CollectionRepo } from './collection.repo'
import { ItemRepo } from './item.repo'
import { AssetRepo } from './asset.repo'
import { NoteRepo } from './note.repo'
import { AnnotationRepo } from './annotation.repo'
import { ExtractionRepo } from './extraction.repo'
import { LayoutRepo } from './layout.repo'
import { EntityRepo } from './entity.repo'
import { FtsRepo } from './fts.repo'
import { TripleRepo } from './triple.repo'

describe('initStore', () => {
  const mockDbClient = {
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
    executeBatch: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue([]),
    selectRows: vi.fn().mockResolvedValue([]),
  }
  const mockDrizzle = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(createDrizzleClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDrizzle)
    ;(runMigrations as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('returns a StoreApi with all repos', async () => {
    const store: StoreApi = await initStore(mockDbClient)

    expect(store.collections).toBeInstanceOf(CollectionRepo)
    expect(store.items).toBeInstanceOf(ItemRepo)
    expect(store.assets).toBeInstanceOf(AssetRepo)
    expect(store.notes).toBeInstanceOf(NoteRepo)
    expect(store.annotations).toBeInstanceOf(AnnotationRepo)
    expect(store.extractions).toBeInstanceOf(ExtractionRepo)
    expect(store.layouts).toBeInstanceOf(LayoutRepo)
    expect(store.entities).toBeInstanceOf(EntityRepo)
    expect(store.fts).toBeInstanceOf(FtsRepo)
    expect(store.triples).toBeInstanceOf(TripleRepo)
  })

  it('uses the injected DbClient for migrations and drizzle', async () => {
    await initStore(mockDbClient)

    expect(runMigrations).toHaveBeenCalledOnce()
    expect(runMigrations).toHaveBeenCalledWith(mockDbClient)
    expect(createDrizzleClient).toHaveBeenCalledOnce()
    expect(createDrizzleClient).toHaveBeenCalledWith(mockDbClient)
  })

  it('runs migrations before creating drizzle client', async () => {
    const callOrder: string[] = []
    ;(runMigrations as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('migrations')
    })
    ;(createDrizzleClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('drizzle')
      return mockDrizzle
    })

    await initStore(mockDbClient)

    expect(callOrder).toEqual(['migrations', 'drizzle'])
  })
})
