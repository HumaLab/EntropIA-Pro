export type PendingAssetJobState = {
  status: 'pending' | 'error'
  progress?: number
  error?: string
}

export async function runPendingAssetJob({
  assetId,
  updateState,
  bumpTick,
  execute,
  fallbackError,
}: {
  assetId: string
  updateState: (assetId: string, state: PendingAssetJobState) => void
  bumpTick: () => void
  execute: () => Promise<unknown>
  fallbackError: string
}): Promise<void> {
  updateState(assetId, { status: 'pending', progress: 0 })
  bumpTick()

  try {
    await execute()
  } catch (error) {
    updateState(assetId, {
      status: 'error',
      error: error instanceof Error ? error.message : fallbackError,
    })
    bumpTick()
  }
}
