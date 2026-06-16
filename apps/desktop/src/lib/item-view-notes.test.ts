import { describe, expect, it } from 'vitest'
import {
  canCancelDelete,
  getNextExpandedNoteId,
  getNoteStateAfterDelete,
  loadNotesForAssetScope,
} from './item-view-notes'

describe('loadNotesForAssetScope', () => {
  it('loads item-level notes when no asset is selected', async () => {
    const calls: string[] = []
    const itemNotes = ['item-note']

    const notes = await loadNotesForAssetScope({
      itemId: 'item-1',
      asset: null,
      findByItem: async (itemId) => {
        calls.push(`item:${itemId}`)
        return itemNotes
      },
      findByAsset: async (itemId, assetId) => {
        calls.push(`asset:${itemId}:${assetId}`)
        return ['asset-note']
      },
    })

    expect(notes).toBe(itemNotes)
    expect(calls).toEqual(['item:item-1'])
  })

  it('loads asset-scoped notes when an asset is selected', async () => {
    const calls: string[] = []
    const assetNotes = ['asset-note']

    const notes = await loadNotesForAssetScope({
      itemId: 'item-1',
      asset: { id: 'asset-1' },
      findByItem: async (itemId) => {
        calls.push(`item:${itemId}`)
        return ['item-note']
      },
      findByAsset: async (itemId, assetId) => {
        calls.push(`asset:${itemId}:${assetId}`)
        return assetNotes
      },
    })

    expect(notes).toBe(assetNotes)
    expect(calls).toEqual(['asset:item-1:asset-1'])
  })
})

describe('getNextExpandedNoteId', () => {
  it('expands the selected note when another note is expanded', () => {
    expect(getNextExpandedNoteId('note-1', 'note-2')).toBe('note-2')
  })

  it('collapses the selected note when it is already expanded', () => {
    expect(getNextExpandedNoteId('note-1', 'note-1')).toBeNull()
  })
})

describe('getNoteStateAfterDelete', () => {
  it('clears expanded, editing, and pending delete state for the deleted note', () => {
    expect(
      getNoteStateAfterDelete(
        {
          expandedNoteId: 'note-1',
          editingNoteId: 'note-1',
          pendingDeleteNoteId: 'note-1',
        },
        'note-1'
      )
    ).toEqual({
      expandedNoteId: null,
      editingNoteId: null,
      pendingDeleteNoteId: null,
    })
  })

  it('keeps unrelated expanded and editing state while clearing pending delete state', () => {
    expect(
      getNoteStateAfterDelete(
        {
          expandedNoteId: 'note-2',
          editingNoteId: 'note-3',
          pendingDeleteNoteId: 'note-1',
        },
        'note-1'
      )
    ).toEqual({
      expandedNoteId: 'note-2',
      editingNoteId: 'note-3',
      pendingDeleteNoteId: null,
    })
  })
})

describe('canCancelDelete', () => {
  it('allows cancelling while deletion is idle', () => {
    expect(canCancelDelete(false)).toBe(true)
  })

  it('blocks cancelling while deletion is in progress', () => {
    expect(canCancelDelete(true)).toBe(false)
  })
})
