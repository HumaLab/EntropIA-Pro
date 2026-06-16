export type LlmScope = 'asset' | 'item'

export interface ActiveLlmTarget {
  scope: LlmScope
  targetId: string
}

export function getActiveLlmTarget({
  itemId,
  selectedAssetId,
}: {
  itemId: string
  selectedAssetId: string | null | undefined
}): ActiveLlmTarget {
  if (selectedAssetId) {
    return { scope: 'asset', targetId: selectedAssetId }
  }

  return { scope: 'item', targetId: itemId }
}

export async function runScopedLlmAction({
  itemId,
  selectedAssetId,
  runAsset,
  runItem,
}: {
  itemId: string
  selectedAssetId: string | null | undefined
  runAsset: (assetId: string) => Promise<unknown>
  runItem: (itemId: string) => Promise<unknown>
}): Promise<void> {
  const target = getActiveLlmTarget({ itemId, selectedAssetId })

  if (target.scope === 'asset') {
    await runAsset(target.targetId)
    return
  }

  await runItem(target.targetId)
}

export function isLlmSummaryJob(job: string) {
  return job === 'summarize'
}

export function isLlmCorrectOcrJob(job: string) {
  return job === 'correct_ocr'
}

export function isLlmTriplesJob(job: string) {
  return job === 'extract_triples'
}

export function selectOcrCorrectionAssetId<TAsset extends { id: string }>({
  completedTargetId,
  selectedAssetId,
  assets,
}: {
  completedTargetId: string
  selectedAssetId: string | null | undefined
  assets: TAsset[]
}): string | null {
  if (selectedAssetId === completedTargetId) {
    return completedTargetId
  }

  if (assets.some((asset) => asset.id === completedTargetId)) {
    return completedTargetId
  }

  return null
}

export function getErrorMessage(error: unknown, fallback = 'Failed') {
  return error instanceof Error ? error.message : fallback
}
