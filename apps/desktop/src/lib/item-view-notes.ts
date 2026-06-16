export type NoteUiState = {
  expandedNoteId: string | null
  editingNoteId: string | null
  pendingDeleteNoteId: string | null
}

type NoteScopeAsset = {
  id: string
}

export async function loadNotesForAssetScope<NoteResult>({
  itemId,
  asset,
  findByItem,
  findByAsset,
}: {
  itemId: string
  asset: NoteScopeAsset | null | undefined
  findByItem: (itemId: string) => Promise<NoteResult[]>
  findByAsset: (itemId: string, assetId: string) => Promise<NoteResult[]>
}) {
  if (!asset) {
    return findByItem(itemId)
  }

  return findByAsset(itemId, asset.id)
}

export function getNextExpandedNoteId(currentExpandedNoteId: string | null, noteId: string) {
  return currentExpandedNoteId === noteId ? null : noteId
}

export function getNoteStateAfterDelete(state: NoteUiState, deletedNoteId: string): NoteUiState {
  return {
    expandedNoteId: state.expandedNoteId === deletedNoteId ? null : state.expandedNoteId,
    editingNoteId: state.editingNoteId === deletedNoteId ? null : state.editingNoteId,
    pendingDeleteNoteId: null,
  }
}

export function canCancelDelete(deletingNote: boolean) {
  return !deletingNote
}
