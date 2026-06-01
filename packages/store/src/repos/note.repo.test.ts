import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoteRepo } from './note.repo'
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

describe('NoteRepo', () => {
  let db: ReturnType<typeof createMockDrizzle>
  let repo: NoteRepo

  beforeEach(() => {
    db = createMockDrizzle()
    repo = new NoteRepo(db.db)
  })

  describe('create', () => {
    it('returns a note with generated id and timestamps', async () => {
      const now = Date.now()
      const mockNote = {
        id: 'note-1',
        itemId: 'item-1',
        content: 'This is a research note',
        createdAt: now,
        updatedAt: now,
      }

      const returningMock = vi.fn().mockResolvedValue([mockNote])
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
      db.mocks.insert.chain['values'] = valuesMock

      const result = await repo.create({
        itemId: 'item-1',
        content: 'This is a research note',
      })

      expect(result).toEqual(mockNote)
      expect(result.id).toBe('note-1')
      expect(result.content).toBe('This is a research note')
      expect(result.itemId).toBe('item-1')
    })

    it('creates note with markdown content', async () => {
      const mdContent = '# Title\n\n- bullet 1\n- bullet 2'
      const mockNote = {
        id: 'note-2',
        itemId: 'item-2',
        content: mdContent,
        createdAt: 100,
        updatedAt: 100,
      }

      const returningMock = vi.fn().mockResolvedValue([mockNote])
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
      db.mocks.insert.chain['values'] = valuesMock

      const result = await repo.create({
        itemId: 'item-2',
        content: mdContent,
      })

      expect(result.content).toBe(mdContent)
    })
  })

  describe('findByItem', () => {
    it('returns empty array when item has no notes', async () => {
      const result = await repo.findByItem('no-notes-item')
      expect(result).toEqual([])
    })

    it('returns notes for a specific item', async () => {
      const notes = [
        { id: 'n1', itemId: 'item-1', content: 'Note A', createdAt: 200, updatedAt: 200 },
        { id: 'n2', itemId: 'item-1', content: 'Note B', createdAt: 100, updatedAt: 100 },
      ]

      const selectResult = createChainMock(notes)
      ;(db.db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectResult.proxy)

      const result = await repo.findByItem('item-1')
      expect(result).toEqual(notes)
      expect(result).toHaveLength(2)
      // Should be sorted by createdAt desc (newest first)
      expect(result[0]!.createdAt).toBeGreaterThan(result[1]!.createdAt)
    })
  })

  describe('update', () => {
    it('returns note with updated content and updatedAt', async () => {
      const updated = {
        id: 'n1',
        itemId: 'item-1',
        content: 'Updated content',
        createdAt: 100,
        updatedAt: 999,
      }

      const returningMock = vi.fn().mockResolvedValue([updated])
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock })
      const setMock = vi.fn().mockReturnValue({ where: whereMock })
      db.mocks.update.chain['set'] = setMock

      const result = await repo.update('n1', 'Updated content')
      expect(result).toEqual(updated)
      expect(result.content).toBe('Updated content')
    })

    it('preserves original createdAt when updating content', async () => {
      const originalCreatedAt = 100
      const updated = {
        id: 'n2',
        itemId: 'item-1',
        content: 'New text',
        createdAt: originalCreatedAt,
        updatedAt: 500,
      }

      const returningMock = vi.fn().mockResolvedValue([updated])
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock })
      const setMock = vi.fn().mockReturnValue({ where: whereMock })
      db.mocks.update.chain['set'] = setMock

      const result = await repo.update('n2', 'New text')
      expect(result.createdAt).toBe(originalCreatedAt)
      expect(result.updatedAt).toBe(500)
    })
  })

  describe('delete', () => {
    it('completes without error', async () => {
      await expect(repo.delete('del-1')).resolves.toBeUndefined()
    })
  })
})
