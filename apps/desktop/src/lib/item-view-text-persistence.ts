type Timer = ReturnType<typeof setTimeout>

export class DebouncedAssetTextPersistor {
  private timers = new Map<string, Timer>()

  constructor(
    private readonly options: {
      delayMs: number
      persist: (assetId: string, text: string) => Promise<unknown>
      afterPersist?: (assetId: string, text: string) => void
      onError?: (error: unknown) => void
    }
  ) {}

  schedule(assetId: string, text: string) {
    this.cancel(assetId)

    const timer = setTimeout(async () => {
      try {
        await this.options.persist(assetId, text)
        this.options.afterPersist?.(assetId, text)
      } catch (error) {
        this.options.onError?.(error)
      } finally {
        this.timers.delete(assetId)
      }
    }, this.options.delayMs)

    this.timers.set(assetId, timer)
  }

  cancel(assetId: string) {
    const existing = this.timers.get(assetId)
    if (existing) {
      clearTimeout(existing)
      this.timers.delete(assetId)
    }
  }

  cancelAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }
}
