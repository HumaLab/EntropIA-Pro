import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TripleRepo } from './triple.repo'
import type { DrizzleClient } from '../types'

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
  const deleteMock = createChainMock([])

  const db = {
    select: vi.fn().mockReturnValue(selectMock.proxy),
    insert: vi.fn().mockReturnValue(insertMock.proxy),
    delete: vi.fn().mockReturnValue(deleteMock.proxy),
  } as unknown as DrizzleClient

  return {
    db,
    mocks: {
      select: selectMock,
      insert: insertMock,
      delete: deleteMock,
    },
  }
}

describe('TripleRepo', () => {
  let db: ReturnType<typeof createMockDrizzle>
  let repo: TripleRepo

  beforeEach(() => {
    db = createMockDrizzle()
    repo = new TripleRepo(db.db)
  })

  it('findByItemId returns only triples for the requested item', async () => {
    const rows = [
      {
        id: 't-1',
        itemId: 'item-a',
        subject: 'San Martín',
        predicate: 'cruza',
        object: 'Los Andes',
        createdAt: 1,
      },
    ]
    const selectResult = createChainMock(rows)
    ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

    const result = await repo.findByItemId('item-a')
    expect(result).toHaveLength(1)
    expect(result[0]?.itemId).toBe('item-a')
    expect(result[0]?.subject).toBe('San Martín')
  })

  it('replaceByItemId replaces only target item triples', async () => {
    const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
    db.mocks.insert.chain['values'] = valuesMock

    await repo.replaceByItemId('item-a', [
      { subject: 'Belgrano', predicate: 'lidera', object: 'Ejército del Norte' },
      { subject: 'Belgrano', predicate: 'crea', object: 'Bandera' },
    ])

    expect(db.db.delete).toHaveBeenCalledOnce()
    expect(db.db.insert).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledOnce()

    const insertedRows = valuesMock.mock.calls[0]?.[0] as Array<{ itemId: string; subject: string }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]?.itemId).toBe('item-a')
    expect(insertedRows[1]?.subject).toBe('Belgrano')
  })

  it('replaceByItemId deletes existing rows when new set is empty', async () => {
    await repo.replaceByItemId('item-empty', [])

    expect(db.db.delete).toHaveBeenCalledOnce()
    expect(db.db.insert).not.toHaveBeenCalled()
  })
})
